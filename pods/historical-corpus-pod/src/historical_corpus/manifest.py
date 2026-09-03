"""Strict, local-only loader for Madoz ingestion manifests."""

from __future__ import annotations

import hashlib
import math
import os
import re
import stat
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Literal
from urllib.parse import urlsplit

import pymupdf
import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator


_MAX_MANIFEST_BYTES = 65536
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_PRINTED_LABEL_RE = re.compile(r"^[1-9][0-9]*$")
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_STRUCTURED_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
_SIDE_ORDER = {"left": 0, "right": 1, "full": 2}


class ManifestValidationError(ValueError):
    """A concise, field-oriented manifest validation failure."""


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    @field_validator("*", mode="before")
    @classmethod
    def _reject_control_characters(cls, value: Any) -> Any:
        if isinstance(value, str) and _CONTROL_RE.search(value):
            raise ValueError("must not contain control characters")
        return value


def _nonblank(value: str, field: str, maximum: int) -> str:
    if not value.strip() or len(value) > maximum:
        raise ValueError(f"{field} must contain 1..{maximum} characters")
    if _CONTROL_RE.search(value):
        raise ValueError(f"{field} must not contain control characters")
    return value


def _relative_path(value: str, field: str) -> str:
    _nonblank(value, field, 512)
    if _STRUCTURED_CONTROL_RE.search(value):
        raise ValueError(f"{field} must not contain control characters")
    path = PurePosixPath(value)
    if path.is_absolute() or value in ("", ".") or ".." in path.parts:
        raise ValueError(f"{field} must be a contained relative path")
    return value


def _http_url(value: str, field: str) -> str:
    _nonblank(value, field, 2048)
    if _STRUCTURED_CONTROL_RE.search(value):
        raise ValueError(f"{field} must not contain control characters")
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError(f"{field} must be an HTTP(S) URL")
    return value


def _bare_sha256(value: str, field: str) -> str:
    if _SHA256_RE.fullmatch(value) is None:
        raise ValueError(f"{field} must be 64 lowercase hexadecimal characters")
    return value


def _structured_text(value: str, field: str, maximum: int) -> str:
    _nonblank(value, field, maximum)
    if _STRUCTURED_CONTROL_RE.search(value):
        raise ValueError(f"{field} must not contain control characters")
    return value


def _aware_timestamp(value: str, field: str) -> str:
    from datetime import datetime

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{field} must be ISO-8601") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{field} must include a timezone")
    return value


def _ref_key(pdf_page: int, side: str) -> tuple[int, int, str]:
    return (pdf_page, _SIDE_ORDER[side], side)


class ManifestDocument(_StrictModel):
    documentId: str = Field(min_length=1, max_length=128)
    workId: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=512)
    author: str = Field(min_length=1, max_length=512)
    edition: str = Field(min_length=1, max_length=512)
    volumeNumber: int = Field(ge=1, le=1000)
    publicationYear: int = Field(ge=1, le=9999)
    language: str = Field(min_length=1, max_length=128)
    countryCode: str = Field(min_length=1, max_length=128)
    sourceClass: str = Field(min_length=1, max_length=128)
    historicalPeriod: str = Field(min_length=1, max_length=64)
    temporalScope: str = Field(min_length=1, max_length=512)

    @field_validator(
        "documentId",
        "workId",
        "language",
        "countryCode",
        "sourceClass",
        "historicalPeriod",
    )
    @classmethod
    def _validate_structured_text(cls, value: str) -> str:
        return _structured_text(value, "document identifier", 128)

    @field_validator("title", "author", "edition", "temporalScope")
    @classmethod
    def _validate_description(cls, value: str) -> str:
        return _nonblank(value, "document metadata", 512)


class ManifestRights(_StrictModel):
    status: Literal[
        "pending_intended_use_review",
        "reviewed_reusable",
        "reviewed_not_reusable",
    ]
    uri: str = Field(min_length=1, max_length=2048)
    verifiedAt: str = Field(min_length=1, max_length=64)
    isExplicitlyReusable: bool

    @field_validator("uri")
    @classmethod
    def _validate_uri(cls, value: str) -> str:
        return _http_url(value, "rights.uri")

    @field_validator("verifiedAt")
    @classmethod
    def _validate_verified_at(cls, value: str) -> str:
        return _aware_timestamp(value, "rights.verifiedAt")

    @model_validator(mode="after")
    def _validate_reuse_status(self) -> "ManifestRights":
        expected = self.status == "reviewed_reusable"
        if self.isExplicitlyReusable is not expected:
            raise ValueError("rights.isExplicitlyReusable conflicts with rights.status")
        return self


class ManifestSource(_StrictModel):
    pdfPath: str
    sourceUrl: str = Field(min_length=1, max_length=2048)
    isExactRecord: bool
    repositoryName: str = Field(min_length=1, max_length=512)
    expectedSha256: str
    attribution: str = Field(min_length=1, max_length=512)
    rights: ManifestRights

    @field_validator("pdfPath")
    @classmethod
    def _validate_pdf_path(cls, value: str) -> str:
        return _relative_path(value, "source.pdfPath")

    @field_validator("sourceUrl")
    @classmethod
    def _validate_source_url(cls, value: str) -> str:
        return _http_url(value, "source.sourceUrl")

    @field_validator("expectedSha256")
    @classmethod
    def _validate_expected_hash(cls, value: str) -> str:
        return _bare_sha256(value, "source.expectedSha256")

    @field_validator("repositoryName", "attribution")
    @classmethod
    def _validate_description(cls, value: str) -> str:
        return _nonblank(value, "source metadata", 512)


class ManifestPageRange(_StrictModel):
    start: int = Field(ge=1, le=1000)
    end: int = Field(ge=1, le=1000)

    @model_validator(mode="after")
    def _validate_order(self) -> "ManifestPageRange":
        if self.start > self.end:
            raise ValueError("start must be <= end")
        return self


class ManifestPageRef(_StrictModel):
    pdfPage: int = Field(ge=1, le=1000)
    side: Literal["left", "right", "full"]


class ManifestDuplicateDecision(_StrictModel):
    first: ManifestPageRef
    second: ManifestPageRef
    decision: Literal["confirmed_duplicate", "false_positive"]
    canonical: ManifestPageRef | None
    reason: str = Field(min_length=1, max_length=512)

    @field_validator("reason")
    @classmethod
    def _validate_reason(cls, value: str) -> str:
        return _nonblank(value, "canonicalization.reason", 512)

    @model_validator(mode="after")
    def _validate_decision(self) -> "ManifestDuplicateDecision":
        if _ref_key(self.first.pdfPage, self.first.side) >= _ref_key(
            self.second.pdfPage, self.second.side
        ):
            raise ValueError("first must precede second")
        if self.decision == "confirmed_duplicate" and self.canonical is None:
            raise ValueError("confirmed_duplicate requires canonical")
        if self.decision == "false_positive" and self.canonical is not None:
            raise ValueError("false_positive cannot declare canonical")
        return self


class ManifestPageOverride(_StrictModel):
    pdfPage: int = Field(ge=1, le=1000)
    side: Literal["left", "right", "full"]
    normalizedPrintedLabel: str | None = None
    canonicalStatus: Literal["include", "exclude_nonbody"] | None = None
    canonicalSequenceIndex: int | None = Field(
        default=None, ge=1, le=2000, exclude_if=lambda value: value is None
    )
    reason: str = Field(min_length=1, max_length=512)

    @field_validator("normalizedPrintedLabel")
    @classmethod
    def _validate_label(cls, value: str | None) -> str | None:
        if value is not None and _PRINTED_LABEL_RE.fullmatch(value) is None:
            raise ValueError("normalizedPrintedLabel must be a positive decimal integer")
        return value

    @field_validator("reason")
    @classmethod
    def _validate_reason(cls, value: str) -> str:
        return _nonblank(value, "canonicalization.reason", 512)

    @model_validator(mode="after")
    def _validate_override(self) -> "ManifestPageOverride":
        if (
            self.normalizedPrintedLabel is None
            and self.canonicalStatus is None
            and self.canonicalSequenceIndex is None
        ):
            raise ValueError("page override requires a label, status, or sequence index")
        if self.canonicalStatus == "exclude_nonbody" and self.canonicalSequenceIndex is not None:
            raise ValueError("exclude_nonbody cannot have canonicalSequenceIndex")
        return self


class ManifestCanonicalization(_StrictModel):
    defaultStatus: Literal["include"]
    defaultOrder: Literal["source_order"]
    duplicateDecisions: list[ManifestDuplicateDecision] = Field(
        default_factory=list, max_length=2000
    )
    pageOverrides: list[ManifestPageOverride] = Field(
        default_factory=list, max_length=2000
    )

    @model_validator(mode="after")
    def _validate_unique_order(self) -> "ManifestCanonicalization":
        decision_keys = [
            (
                _ref_key(item.first.pdfPage, item.first.side),
                _ref_key(item.second.pdfPage, item.second.side),
            )
            for item in self.duplicateDecisions
        ]
        if decision_keys != sorted(set(decision_keys)):
            raise ValueError("duplicateDecisions must be unique and ordered")
        override_keys = [
            _ref_key(item.pdfPage, item.side) for item in self.pageOverrides
        ]
        if override_keys != sorted(set(override_keys)):
            raise ValueError("pageOverrides must be unique and ordered")
        return self


class ManifestTableRegion(_StrictModel):
    box: list[float] = Field(min_length=4, max_length=4)
    ocrRotationDegrees: Literal[90, 270] | None = None

    @field_validator("box")
    @classmethod
    def _validate_box(cls, value: list[float]) -> list[float]:
        if not all(math.isfinite(item) and 0.0 <= item <= 1.0 for item in value):
            raise ValueError("box values must be finite and normalized")
        if value[2] <= value[0] or value[3] <= value[1]:
            raise ValueError("box must have positive width and height")
        return value


class ManifestLeafOverride(_StrictModel):
    pdfPage: int = Field(ge=1, le=1000)
    side: Literal["left", "right", "full"]
    contentClass: Literal["normal", "table", "mixed_orientation"]
    rotationDegrees: Literal[0, 90, 180, 270]
    tableRegions: list[ManifestTableRegion] = Field(
        default_factory=list, max_length=32
    )

    @model_validator(mode="after")
    def _validate_regions(self) -> "ManifestLeafOverride":
        for index, first in enumerate(self.tableRegions):
            a = first.box
            for second in self.tableRegions[index + 1 :]:
                b = second.box
                separated = (
                    a[2] <= b[0]
                    or b[2] <= a[0]
                    or a[3] <= b[1]
                    or b[3] <= a[1]
                )
                if not separated:
                    raise ValueError("tableRegions must be non-overlapping")
        return self


class ManifestSelection(_StrictModel):
    candidatePdfPageRanges: list[ManifestPageRange] = Field(
        min_length=1, max_length=128
    )
    pageInventoryPath: str
    expectedPageInventorySha256: str | None
    inventoryReviewStatus: Literal["pending", "verified"]
    inventoryVerifiedAt: str | None
    canonicalization: ManifestCanonicalization
    splitSpreads: bool
    gutterRatio: float = Field(ge=0.45, le=0.55)
    innerGutterTrimRatio: float = Field(ge=0.0, le=0.02)
    leafOverrides: list[ManifestLeafOverride] = Field(
        default_factory=list, max_length=2000
    )

    @field_validator("pageInventoryPath")
    @classmethod
    def _validate_inventory_path(cls, value: str) -> str:
        return _relative_path(value, "selection.pageInventoryPath")

    @field_validator("expectedPageInventorySha256")
    @classmethod
    def _validate_inventory_hash(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _bare_sha256(value, "selection.expectedPageInventorySha256")

    @field_validator("inventoryVerifiedAt")
    @classmethod
    def _validate_inventory_time(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _aware_timestamp(value, "selection.inventoryVerifiedAt")

    @field_validator("gutterRatio", "innerGutterTrimRatio")
    @classmethod
    def _validate_ratios(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("ratio must be finite")
        return value

    @model_validator(mode="after")
    def _validate_selection(self) -> "ManifestSelection":
        previous_end: int | None = None
        for item in self.candidatePdfPageRanges:
            if previous_end is not None and item.start <= previous_end:
                raise ValueError(
                    "candidatePdfPageRanges must be ordered and non-overlapping"
                )
            previous_end = item.end
        keys = [_ref_key(item.pdfPage, item.side) for item in self.leafOverrides]
        if keys != sorted(set(keys)):
            raise ValueError("leafOverrides must be unique and ordered")
        if self.inventoryReviewStatus == "verified" and (
            self.expectedPageInventorySha256 is None
            or self.inventoryVerifiedAt is None
        ):
            raise ValueError(
                "verified inventory requires expectedPageInventorySha256 and inventoryVerifiedAt"
            )
        if self.inventoryReviewStatus == "pending" and self.inventoryVerifiedAt is not None:
            raise ValueError("pending inventory cannot have inventoryVerifiedAt")
        return self


class ManifestPrintedRange(_StrictModel):
    start: str
    end: str

    @field_validator("start", "end")
    @classmethod
    def _validate_printed_label(cls, value: str) -> str:
        if _PRINTED_LABEL_RE.fullmatch(value) is None:
            raise ValueError("printed page must be a positive decimal integer")
        return value

    @model_validator(mode="after")
    def _validate_order(self) -> "ManifestPrintedRange":
        if int(self.start) > int(self.end):
            raise ValueError("start must be <= end")
        return self


class ManifestCoverage(_StrictModel):
    status: Literal["unknown", "partial_source", "complete_source"]
    statement: str | None = Field(default=None, min_length=1, max_length=2048)
    observedPrintedRanges: list[ManifestPrintedRange] = Field(
        default_factory=list, max_length=2000
    )
    missingPrintedPages: list[str] = Field(default_factory=list, max_length=2000)
    acceptedForProduct: bool
    acceptedAt: str | None

    @field_validator("statement")
    @classmethod
    def _validate_statement(cls, value: str | None) -> str | None:
        return None if value is None else _nonblank(value, "coverage.statement", 2048)

    @field_validator("acceptedAt")
    @classmethod
    def _validate_accepted_at(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _aware_timestamp(value, "coverage.acceptedAt")

    @field_validator("missingPrintedPages")
    @classmethod
    def _validate_missing_labels(cls, value: list[str]) -> list[str]:
        for item in value:
            if _PRINTED_LABEL_RE.fullmatch(item) is None:
                raise ValueError("missingPrintedPages must be positive decimal integers")
        return value

    @model_validator(mode="after")
    def _validate_coverage(self) -> "ManifestCoverage":
        previous_end: int | None = None
        for item in self.observedPrintedRanges:
            if previous_end is not None and int(item.start) <= previous_end:
                raise ValueError(
                    "observedPrintedRanges must be ordered and non-overlapping"
                )
            previous_end = int(item.end)
        numbers = [int(item) for item in self.missingPrintedPages]
        if numbers != sorted(set(numbers)):
            raise ValueError("missingPrintedPages must be unique and ordered")
        for number in numbers:
            if any(
                int(item.start) <= number <= int(item.end)
                for item in self.observedPrintedRanges
            ):
                raise ValueError(
                    "missingPrintedPages must be outside observedPrintedRanges"
                )
        if self.status == "partial_source" and (
            self.statement is None or not self.missingPrintedPages
        ):
            raise ValueError(
                "partial_source requires statement and missingPrintedPages"
            )
        if self.status == "complete_source" and self.missingPrintedPages:
            raise ValueError("complete_source cannot declare missingPrintedPages")
        if self.status == "unknown" and self.acceptedForProduct:
            raise ValueError("unknown coverage cannot be accepted")
        if self.acceptedForProduct != (self.acceptedAt is not None):
            raise ValueError(
                "acceptedAt must be present exactly when coverage is accepted"
            )
        return self


class ManifestProcessing(_StrictModel):
    textMode: Literal["ocr", "embedded_first"]
    renderDpi: int = Field(ge=150, le=400)
    embeddedPolicy: Literal["madoz-embedded-v1"] | None = None
    embeddedMinCharacters: int | None = Field(default=None, ge=1, le=1000000)
    embeddedMinAlphabeticRatio: float | None = Field(default=None, ge=0.0, le=1.0)
    embeddedMaxTokenRepetitionRatio: float | None = Field(default=None, ge=0.0, le=1.0)
    rasterizationPolicy: Literal["pymupdf-page-render-v1"]
    ocrEngine: Literal["transformers"]
    ocrDetectionModel: Literal["PP-OCRv6_medium_det"]
    ocrRecognitionModel: Literal["PP-OCRv6_medium_rec"]
    ocrLanguage: Literal["es"]
    device: Literal["cpu"]
    modelLockFile: str
    documentOrientationClassification: Literal[False]
    documentUnwarping: Literal[False]
    textLineOrientation: Literal[True]
    lowConfidenceThreshold: float = Field(ge=0.0, le=1.0)
    maxChunkChars: int = Field(ge=256, le=65536)
    overlapLines: int = Field(ge=0, le=32)
    layoutPolicy: Literal["madoz-two-column-v1"]
    entryPolicy: Literal["madoz-entry-v1"]

    @field_validator("modelLockFile")
    @classmethod
    def _validate_lock_path(cls, value: str) -> str:
        return _relative_path(value, "processing.modelLockFile")

    @field_validator("lowConfidenceThreshold")
    @classmethod
    def _validate_threshold(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("lowConfidenceThreshold must be finite")
        return value

    @field_validator("embeddedMinAlphabeticRatio", "embeddedMaxTokenRepetitionRatio")
    @classmethod
    def _validate_embedded_ratios(cls, value: float | None) -> float | None:
        if value is not None and not math.isfinite(value):
            raise ValueError("embedded ratio must be finite")
        return value

    @model_validator(mode="after")
    def _validate_text_mode_contract(self) -> "ManifestProcessing":
        embedded_fields = (
            "embeddedPolicy",
            "embeddedMinCharacters",
            "embeddedMinAlphabeticRatio",
            "embeddedMaxTokenRepetitionRatio",
        )
        if self.textMode == "embedded_first":
            for name in embedded_fields:
                if getattr(self, name) is None:
                    raise ValueError(f"embedded_first requires {name}")
        else:
            for name in embedded_fields:
                if getattr(self, name) is not None:
                    raise ValueError(f"ocr mode cannot set {name}")
        return self


class MadozManifest(_StrictModel):
    schemaVersion: Literal[1]
    document: ManifestDocument
    source: ManifestSource
    selection: ManifestSelection
    coverage: ManifestCoverage
    processing: ManifestProcessing

    @property
    def prepare_allowed(self) -> bool:
        return (
            self.selection.inventoryReviewStatus == "verified"
            and self.selection.expectedPageInventorySha256 is not None
            and self.selection.inventoryVerifiedAt is not None
        )

    @property
    def publish_allowed(self) -> bool:
        rights = self.source.rights
        return (
            self.prepare_allowed
            and self.source.isExactRecord
            and rights.status == "reviewed_reusable"
            and rights.isExplicitlyReusable
            and self.coverage.status != "unknown"
            and self.coverage.acceptedForProduct
            and self.coverage.acceptedAt is not None
        )


@dataclass(frozen=True)
class ValidatedManifestSource:
    pdf_path: Path
    inventory_path: Path
    pdf_sha256: str
    inventory_sha256: str | None
    pdf_page_count: int


def _validation_error(error: ValidationError) -> ManifestValidationError:
    first = error.errors(include_url=False)[0]
    location = ".".join(str(part) for part in first["loc"]) or "manifest"
    return ManifestValidationError(f"{location}: {first['msg']}")


def load_manifest(path: str | Path) -> MadozManifest:
    manifest_path = Path(path)
    try:
        with manifest_path.open("rb") as handle:
            payload = handle.read(_MAX_MANIFEST_BYTES + 1)
    except OSError:
        raise ManifestValidationError("manifest: unable to read file") from None
    if len(payload) > _MAX_MANIFEST_BYTES:
        raise ManifestValidationError("manifest: maximum size is 65536 bytes")
    try:
        decoded = payload.decode("utf-8")
        loaded = yaml.safe_load(decoded)
    except (UnicodeDecodeError, yaml.YAMLError):
        raise ManifestValidationError("YAML: invalid or unsafe manifest") from None
    if not isinstance(loaded, dict):
        raise ManifestValidationError("manifest: YAML root must be a mapping")
    try:
        return MadozManifest.model_validate(loaded)
    except ValidationError as exc:
        raise _validation_error(exc) from None


def _resolve_local_path(
    imports_root: Path,
    relative_path: str,
    field: str,
    *,
    require_regular: bool,
) -> Path:
    root = imports_root.resolve()
    current = root
    parts = PurePosixPath(relative_path).parts
    for index, part in enumerate(parts):
        current = current / part
        try:
            info = os.lstat(current)
        except FileNotFoundError:
            if require_regular:
                raise ManifestValidationError(f"{field}: local path is missing") from None
            return current.joinpath(*parts[index + 1 :])
        except OSError as exc:
            raise ManifestValidationError(f"{field}: local path is inaccessible") from exc
        if stat.S_ISLNK(info.st_mode):
            raise ManifestValidationError(f"{field}: symlinks are not allowed")
        if index < len(parts) - 1 and not stat.S_ISDIR(info.st_mode):
            raise ManifestValidationError(f"{field}: parent is not a directory")
        if index == len(parts) - 1 and require_regular and not stat.S_ISREG(info.st_mode):
            raise ManifestValidationError(f"{field}: must be a regular file")
    return current


def _stream_sha256(
    path: Path,
    field: str,
    *,
    maximum_bytes: int | None = None,
) -> str:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise ManifestValidationError(f"{field}: unable to open local file") from exc
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise ManifestValidationError(f"{field}: must be a regular file")
        digest = hashlib.sha256()
        total = 0
        while block := os.read(descriptor, 1024 * 1024):
            total += len(block)
            if maximum_bytes is not None and total > maximum_bytes:
                raise ManifestValidationError(
                    f"{field}: file exceeds {maximum_bytes} bytes"
                )
            digest.update(block)
        return digest.hexdigest()
    except OSError as exc:
        raise ManifestValidationError(f"{field}: unable to read local file") from exc
    finally:
        os.close(descriptor)


def _page_is_selected(manifest: MadozManifest, page: int) -> bool:
    return any(
        item.start <= page <= item.end
        for item in manifest.selection.candidatePdfPageRanges
    )


def _validate_page_ref(
    manifest: MadozManifest,
    page: int,
    side: str,
    field: str,
    page_count: int,
) -> None:
    if page > page_count or not _page_is_selected(manifest, page):
        raise ManifestValidationError(
            f"{field}: pdfPage must be inside candidatePdfPageRanges"
        )
    expected_sides = {"left", "right"} if manifest.selection.splitSpreads else {"full"}
    if side not in expected_sides:
        raise ManifestValidationError(f"{field}: side conflicts with splitSpreads")


def validate_manifest_source(
    manifest: MadozManifest,
    imports_root: str | Path,
) -> ValidatedManifestSource:
    root = Path(imports_root)
    pdf_path = _resolve_local_path(
        root, manifest.source.pdfPath, "source.pdfPath", require_regular=True
    )
    pdf_sha256 = _stream_sha256(pdf_path, "source.pdfPath")
    if pdf_sha256 != manifest.source.expectedSha256:
        raise ManifestValidationError(
            "source.expectedSha256: local PDF digest does not match"
        )
    try:
        document = pymupdf.open(pdf_path)
        try:
            if document.is_encrypted or document.needs_pass:
                raise ManifestValidationError("source.pdfPath: encrypted PDF is not allowed")
            page_count = document.page_count
        finally:
            document.close()
    except ManifestValidationError:
        raise
    except Exception as exc:
        raise ManifestValidationError("source.pdfPath: invalid PDF") from exc
    if page_count < 1:
        raise ManifestValidationError("source.pdfPath: PDF has no pages")
    for item in manifest.selection.candidatePdfPageRanges:
        if item.end > page_count:
            raise ManifestValidationError(
                "selection.candidatePdfPageRanges: range exceeds PDF page count"
            )
    for item in manifest.selection.leafOverrides:
        _validate_page_ref(
            manifest,
            item.pdfPage,
            item.side,
            "selection.leafOverrides",
            page_count,
        )
    for item in manifest.selection.canonicalization.pageOverrides:
        _validate_page_ref(
            manifest,
            item.pdfPage,
            item.side,
            "selection.canonicalization.pageOverrides",
            page_count,
        )
    for item in manifest.selection.canonicalization.duplicateDecisions:
        refs = [item.first, item.second]
        if item.canonical is not None:
            refs.append(item.canonical)
        for ref in refs:
            _validate_page_ref(
                manifest,
                ref.pdfPage,
                ref.side,
                "selection.canonicalization.duplicateDecisions",
                page_count,
            )

    inventory_path = _resolve_local_path(
        root,
        manifest.selection.pageInventoryPath,
        "selection.pageInventoryPath",
        require_regular=manifest.prepare_allowed,
    )
    inventory_sha256: str | None = None
    if manifest.prepare_allowed:
        inventory_sha256 = _stream_sha256(
            inventory_path,
            "selection.pageInventoryPath",
            maximum_bytes=2 * 1024 * 1024,
        )
        if inventory_sha256 != manifest.selection.expectedPageInventorySha256:
            raise ManifestValidationError(
                "selection.expectedPageInventorySha256: local inventory digest does not match"
            )
    return ValidatedManifestSource(
        pdf_path=pdf_path,
        inventory_path=inventory_path,
        pdf_sha256=pdf_sha256,
        inventory_sha256=inventory_sha256,
        pdf_page_count=page_count,
    )
