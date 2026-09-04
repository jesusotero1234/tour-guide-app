from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Literal, Sequence

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from .ingest_models import SourcePageInput
from .manifest import ManifestCorrections


_MAX_CORRECTION_BYTES = 16 * 1024 * 1024
_MAX_CORRECTIONS = 10_000
_SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")


class CorrectionSetError(ValueError):
    """The configured correction set is unsafe, invalid, or stale."""


class OcrTextCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal[1]
    documentId: str = Field(min_length=1, max_length=128)
    sourcePdfPageNumber: int = Field(ge=1, le=1000)
    logicalPageNumber: int = Field(ge=1, le=2000)
    lineOrder: int = Field(ge=0, le=999)
    lineId: str
    originalTextSha256: str
    correctedText: str = Field(min_length=1, max_length=4096)
    authority: Literal["ai_adjudicated"]
    reviewedAt: datetime

    @field_validator("lineId", "originalTextSha256")
    @classmethod
    def _validate_hash(cls, value: str) -> str:
        if _SHA256_RE.fullmatch(value) is None:
            raise ValueError("must be sha256:<64 lowercase hex>")
        return value

    @field_validator("correctedText")
    @classmethod
    def _validate_corrected_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("correctedText must contain non-whitespace text")
        return value

    @field_validator("reviewedAt")
    @classmethod
    def _validate_reviewed_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("reviewedAt must include a timezone")
        return value


@dataclass(frozen=True)
class LoadedCorrectionSet:
    relative_path: str
    sha256: str
    authority: Literal["ai_adjudicated"]
    review_status: Literal["ai_adjudicated_not_human_certified"]
    records: tuple[OcrTextCorrection, ...]


def _safe_correction_path(imports_root: str | Path, relative_path: str) -> Path:
    root = Path(imports_root).resolve()
    parts = PurePosixPath(relative_path).parts
    candidate = root.joinpath(*parts)
    current = root
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise CorrectionSetError("correction path must not contain symlinks")
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(root)
    except (OSError, ValueError):
        raise CorrectionSetError("correction path must resolve beneath imports root") from None
    if not resolved.is_file():
        raise CorrectionSetError("correction path must reference a regular file")
    return resolved


def load_correction_set(
    config: ManifestCorrections,
    imports_root: str | Path,
    document_id: str,
) -> LoadedCorrectionSet:
    path = _safe_correction_path(imports_root, config.path)
    try:
        with path.open("rb") as handle:
            payload = handle.read(_MAX_CORRECTION_BYTES + 1)
    except OSError:
        raise CorrectionSetError("unable to read correction set") from None
    if len(payload) > _MAX_CORRECTION_BYTES:
        raise CorrectionSetError("correction set exceeds 16 MiB")

    digest = hashlib.sha256(payload).hexdigest()
    if digest != config.expectedSha256:
        raise CorrectionSetError("correction set digest does not match manifest")
    try:
        decoded = payload.decode("utf-8")
    except UnicodeDecodeError:
        raise CorrectionSetError("correction set must be UTF-8 JSONL") from None

    raw_lines = decoded.splitlines()
    if not raw_lines:
        raise CorrectionSetError("correction set must contain at least one record")
    if len(raw_lines) > _MAX_CORRECTIONS:
        raise CorrectionSetError("correction set exceeds 10000 records")
    if any(not line.strip() for line in raw_lines):
        raise CorrectionSetError("correction set must not contain blank records")

    records: list[OcrTextCorrection] = []
    for line_number, raw_line in enumerate(raw_lines, start=1):
        try:
            record = OcrTextCorrection.model_validate_json(raw_line)
        except ValidationError as exc:
            details = exc.errors(include_url=False)
            field = ".".join(str(part) for part in details[0].get("loc", ()))
            suffix = f".{field}" if field else ""
            raise CorrectionSetError(
                f"correction record {line_number}{suffix} is invalid"
            ) from None
        if record.documentId != document_id:
            raise CorrectionSetError(
                f"correction record {line_number} documentId does not match manifest"
            )
        if record.authority != config.authority:
            raise CorrectionSetError(
                f"correction record {line_number} authority does not match manifest"
            )
        records.append(record)

    line_ids = [record.lineId for record in records]
    if len(line_ids) != len(set(line_ids)):
        raise CorrectionSetError("correction set contains duplicate lineId records")
    order = [
        (record.logicalPageNumber, record.lineOrder, record.lineId)
        for record in records
    ]
    if order != sorted(order):
        raise CorrectionSetError("correction records must be in source order")

    return LoadedCorrectionSet(
        relative_path=config.path,
        sha256=f"sha256:{digest}",
        authority=config.authority,
        review_status=config.reviewStatus,
        records=tuple(records),
    )


def _original_text_hash(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def apply_corrections(
    pages: Sequence[SourcePageInput],
    correction_set: LoadedCorrectionSet,
) -> list[SourcePageInput]:
    page_list = list(pages)
    locations: dict[str, list[tuple[int, int]]] = {}
    for page_index, page in enumerate(page_list):
        for line_index, line in enumerate(page.lines):
            locations.setdefault(line.lineId, []).append((page_index, line_index))

    replacements: dict[tuple[int, int], str] = {}
    used: set[str] = set()
    for record in correction_set.records:
        matches = locations.get(record.lineId, [])
        if len(matches) != 1:
            raise CorrectionSetError(
                "unused correction: lineId must match exactly one source line"
            )
        page_index, line_index = matches[0]
        page = page_list[page_index]
        line = page.lines[line_index]
        if (
            page.documentId != record.documentId
            or page.sourcePdfPageNumber != record.sourcePdfPageNumber
            or page.logicalPageNumber != record.logicalPageNumber
            or line.logicalPageNumber != record.logicalPageNumber
            or line.lineOrder != record.lineOrder
        ):
            raise CorrectionSetError("stale correction locator does not match source line")
        if _original_text_hash(line.originalText) != record.originalTextSha256:
            raise CorrectionSetError("stale correction originalTextSha256 does not match")
        if line.correctedText is not None:
            raise CorrectionSetError("correction target is already corrected")
        if record.correctedText == line.originalText:
            raise CorrectionSetError("no-op correction is not allowed")
        replacements[(page_index, line_index)] = record.correctedText
        used.add(record.lineId)

    if used != {record.lineId for record in correction_set.records}:
        raise CorrectionSetError("unused correction records remain")

    corrected_pages: list[SourcePageInput] = []
    for page_index, page in enumerate(page_list):
        page_payload = page.model_dump(mode="json", by_alias=True, exclude_none=False)
        line_payloads = []
        for line_index, line in enumerate(page.lines):
            line_payload = line.model_dump(mode="json", by_alias=True, exclude_none=False)
            replacement = replacements.get((page_index, line_index))
            if replacement is not None:
                line_payload["correctedText"] = replacement
            line_payloads.append(line_payload)
        page_payload["lines"] = line_payloads
        try:
            corrected_pages.append(SourcePageInput.model_validate(page_payload))
        except ValidationError:
            raise CorrectionSetError("corrected page is invalid") from None
    return corrected_pages
