from __future__ import annotations

import hashlib
import math
from datetime import datetime
from pathlib import PurePosixPath
import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from historical_corpus.identity import canonical_json_bytes, compute_chunk_id, compute_line_id, compute_page_id
from historical_corpus.models import ChunkInput, DocumentMetadata, NormalizedBox, PrintedRange


_SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_HEX64_RE = re.compile(r"^[0-9a-f]{16}$")
_PRINTED_LABEL_RE = re.compile(r"^[1-9][0-9]{0,3}$")
_SIDE_ORDER = {"full": 0, "left": 0, "right": 1}


def _require_finite(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("must be finite")
    return value


def _require_sha256(value: str) -> str:
    if not _SHA256_RE.fullmatch(value):
        raise ValueError("must be sha256:<64 lowercase hex>")
    return value


def _require_hex64(value: str) -> str:
    if not _HEX64_RE.fullmatch(value):
        raise ValueError("must be 16 lowercase hexadecimal characters")
    return value


def _require_printed_label(value: str) -> str:
    if not _PRINTED_LABEL_RE.fullmatch(value):
        raise ValueError("must match ^[1-9][0-9]{0,3}$")
    return value


def _require_nonblank(value: str) -> str:
    if not value.strip():
        raise ValueError("must be non-blank")
    return value


def _require_safe_relative_path(value: str) -> str:
    if not value or len(value) > 512:
        raise ValueError("path must contain 1..512 characters")
    if "\x00" in value or "\\" in value or "%" in value:
        raise ValueError("path contains a forbidden character")
    path = PurePosixPath(value)
    if path.is_absolute():
        raise ValueError("path must be relative")
    parts = value.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise ValueError("path contains a forbidden segment")
    return value


def _physical_ref_key(pdf_page: int, side: str) -> tuple[int, str]:
    return (pdf_page, side)


def _physical_sort_key(pdf_page: int, side: str) -> tuple[int, int, str]:
    return (pdf_page, _SIDE_ORDER[side], side)


def _page_ref_key(ref: "InventoryPageRef") -> tuple[int, int, str]:
    return _physical_sort_key(ref.pdfPage, ref.side)


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _FrozenStrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class CoverageMetadata(_StrictModel):
    status: Literal["unknown", "partial_source", "complete_source"]
    statement: str | None = Field(default=None, min_length=1, max_length=2048)
    observedPrintedRanges: list[PrintedRange] = Field(default_factory=list, max_length=2000)
    missingPrintedPages: list[str] = Field(default_factory=list, max_length=2000)
    acceptedForProduct: bool
    acceptedAt: datetime | None

    @field_validator("statement")
    @classmethod
    def _validate_statement(cls, value: str | None) -> str | None:
        return None if value is None else _require_nonblank(value)

    @field_validator("acceptedAt")
    @classmethod
    def _validate_accepted_at(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("acceptedAt must include a timezone")
        return value

    @model_validator(mode="after")
    def _validate_coverage(self) -> "CoverageMetadata":
        previous_end: int | None = None
        for item in self.observedPrintedRanges:
            start, end = int(item.start), int(item.end)
            if previous_end is not None and start <= previous_end:
                raise ValueError("observedPrintedRanges must be ordered and non-overlapping")
            previous_end = end

        previous_missing: int | None = None
        for label in self.missingPrintedPages:
            _require_printed_label(label)
            number = int(label)
            if previous_missing is not None and number <= previous_missing:
                raise ValueError("missingPrintedPages must be unique and numerically ordered")
            if any(int(item.start) <= number <= int(item.end) for item in self.observedPrintedRanges):
                raise ValueError("missingPrintedPages must be outside observedPrintedRanges")
            previous_missing = number

        if self.status == "partial_source":
            if self.statement is None or not self.missingPrintedPages:
                raise ValueError("partial_source requires statement and missingPrintedPages")
        elif self.status == "complete_source" and self.missingPrintedPages:
            raise ValueError("complete_source cannot declare missingPrintedPages")
        elif self.status == "unknown" and self.acceptedForProduct:
            raise ValueError("unknown coverage cannot be accepted")

        if self.acceptedForProduct != (self.acceptedAt is not None):
            raise ValueError("acceptedAt must be present exactly when coverage is accepted")
        return self


class PublicationGateSnapshot(_StrictModel):
    sourceIsExactRecord: bool
    coverage: CoverageMetadata


PixelPoint = Annotated[list[float], Field(min_length=2, max_length=2)]


class ExtractedLineCandidate(_StrictModel):
    originalText: str = Field(min_length=1, max_length=4096)
    confidence: float = Field(ge=0.0, le=1.0)
    polygon: list[PixelPoint] = Field(min_length=4, max_length=4)
    correction180: Literal[0, 180]

    @field_validator("confidence")
    @classmethod
    def _validate_confidence(cls, value: float) -> float:
        return _require_finite(value)

    @field_validator("polygon")
    @classmethod
    def _validate_polygon(cls, value: list[PixelPoint]) -> list[PixelPoint]:
        for point in value:
            for coordinate in point:
                _require_finite(coordinate)
                if coordinate < 0:
                    raise ValueError("polygon coordinates must be nonnegative")
        return value


class SourceLineInput(_StrictModel):
    lineId: str
    logicalPageNumber: int = Field(ge=1, le=2000)
    lineOrder: int = Field(ge=0, le=999)
    originalText: str = Field(min_length=1, max_length=4096)
    correctedText: str | None = Field(
        default=None,
        min_length=1,
        max_length=4096,
        exclude_if=lambda value: value is None,
    )
    confidence: float = Field(ge=0.0, le=1.0)
    box: NormalizedBox
    orientationDegrees: Literal[0, 90, 180, 270] | None
    role: Literal["body", "header", "footer", "table", "unknown"]

    @field_validator("lineId")
    @classmethod
    def _validate_id(cls, value: str) -> str:
        return _require_sha256(value)

    @field_validator("confidence")
    @classmethod
    def _validate_confidence(cls, value: float) -> float:
        return _require_finite(value)


QualityFlag = Literal[
    "blank",
    "embedded_fallback_invalid_box",
    "embedded_fallback_low_alphabetic_ratio",
    "embedded_fallback_missing_text",
    "embedded_fallback_repeated_tokens",
    "embedded_fallback_special_layout",
    "embedded_fallback_too_many_lines",
    "embedded_fallback_too_short",
    "low_confidence",
    "mixed_orientation",
    "oversize_body_line",
    "rotation_applied",
    "table_heavy",
]


class SourcePageInput(_StrictModel):
    pageId: str
    documentId: str = Field(min_length=1, max_length=128)
    logicalPageNumber: int = Field(ge=1, le=2000)
    sourcePdfPageNumber: int = Field(ge=1, le=1000)
    leafSide: Literal["left", "right", "full"]
    continuityBreakBefore: bool
    cropBox: NormalizedBox
    printedPageLabel: str | None = None
    widthPx: int = Field(ge=1, le=100000)
    heightPx: int = Field(ge=1, le=100000)
    renderDpi: int = Field(ge=150, le=400)
    rasterizationPolicy: str = Field(min_length=1, max_length=128)
    rotationDegrees: Literal[0, 90, 180, 270]
    imageSha256: str
    contentClass: Literal["normal", "table", "mixed_orientation"]
    foregroundRatio: float = Field(ge=0.0, le=1.0)
    textSource: Literal["ppocrv6", "embedded"]
    ocrEngine: Literal["transformers", "pymupdf"]
    ocrEngineVersion: str = Field(min_length=1, max_length=64)
    ocrDetectionModel: str = Field(min_length=1, max_length=128)
    ocrRecognitionModel: str = Field(min_length=1, max_length=128)
    meanConfidence: float = Field(ge=0.0, le=1.0)
    lowConfidenceRatio: float = Field(ge=0.0, le=1.0)
    qualityScore: float = Field(ge=0.0, le=1.0)
    qualityFlags: list[QualityFlag] = Field(default_factory=list, max_length=8)
    originalText: str = Field(max_length=4096999)
    lines: list[SourceLineInput] = Field(default_factory=list, max_length=1000)

    @field_validator("pageId", "imageSha256")
    @classmethod
    def _validate_hashes(cls, value: str) -> str:
        return _require_sha256(value)

    @field_validator("printedPageLabel")
    @classmethod
    def _validate_printed_page(cls, value: str | None) -> str | None:
        return None if value is None else _require_printed_label(value)

    @field_validator("foregroundRatio", "meanConfidence", "lowConfidenceRatio", "qualityScore")
    @classmethod
    def _validate_metrics(cls, value: float) -> float:
        return _require_finite(value)

    @field_validator("qualityFlags")
    @classmethod
    def _validate_quality_flags(cls, value: list[QualityFlag]) -> list[QualityFlag]:
        if value != sorted(set(value)):
            raise ValueError("qualityFlags must be unique and sorted")
        return value

    @model_validator(mode="after")
    def _validate_lines(self) -> "SourcePageInput":
        orders = [line.lineOrder for line in self.lines]
        if orders != sorted(set(orders)):
            raise ValueError("lines must have unique increasing lineOrder")
        if any(line.logicalPageNumber != self.logicalPageNumber for line in self.lines):
            raise ValueError("line logicalPageNumber must match its page")
        if self.textSource == "ppocrv6":
            if self.ocrEngine != "transformers":
                raise ValueError("ppocrv6 textSource requires transformers ocrEngine")
        elif (
            self.ocrEngine != "pymupdf"
            or self.ocrDetectionModel != "pdf-text-layer"
            or self.ocrRecognitionModel != "pdf-text-layer"
        ):
            raise ValueError(
                "embedded textSource requires pymupdf and pdf-text-layer models"
            )
        return self


class PrintedLabelCandidate(_StrictModel):
    text: str = Field(min_length=1, max_length=16)
    box: NormalizedBox


class InventoryPageRef(_StrictModel):
    pdfPage: int = Field(ge=1, le=1000)
    side: Literal["left", "right", "full"]


DuplicateReason = Literal[
    "dhash_le_5",
    "manual_review",
    "same_embedded_text_sha",
    "same_label",
    "simhash_le_3",
]


class DuplicateCandidate(_StrictModel):
    pdfPage: int = Field(ge=1, le=1000)
    side: Literal["left", "right", "full"]
    reasons: list[DuplicateReason] = Field(min_length=1, max_length=4)
    decision: Literal["pending", "confirmed_duplicate", "false_positive"]
    canonical: InventoryPageRef | None
    decisionReason: str | None = Field(default=None, min_length=1, max_length=512)

    @field_validator("reasons")
    @classmethod
    def _validate_reasons(cls, value: list[DuplicateReason]) -> list[DuplicateReason]:
        if value != sorted(set(value)):
            raise ValueError("reasons must be unique and sorted")
        return value

    @field_validator("decisionReason")
    @classmethod
    def _validate_reason(cls, value: str | None) -> str | None:
        return None if value is None else _require_nonblank(value)

    @model_validator(mode="after")
    def _validate_decision(self) -> "DuplicateCandidate":
        if self.decision == "pending":
            if self.canonical is not None or self.decisionReason is not None:
                raise ValueError("pending candidate cannot have a canonical or reason")
        elif self.decision == "false_positive":
            if self.canonical is not None or self.decisionReason is None:
                raise ValueError("false_positive requires only a reason")
        elif self.canonical is None or self.decisionReason is None:
            raise ValueError("confirmed_duplicate requires canonical and reason")
        return self


AnomalyFlag = Literal[
    "label_missing",
    "label_ambiguous",
    "gap",
    "declared_gap",
    "candidate_range_break",
    "repeat",
    "decrease",
    "near_duplicate",
]


class PageInventoryRecord(_StrictModel):
    schemaVersion: Literal[1]
    pdfPage: int = Field(ge=1, le=1000)
    side: Literal["left", "right", "full"]
    mediaBox: tuple[float, float, float, float]
    pdfRotationDegrees: Literal[0, 90, 180, 270]
    rasterWidthPx: int | None = Field(default=None, ge=1, le=100000)
    rasterHeightPx: int | None = Field(default=None, ge=1, le=100000)
    rasterBitsPerComponent: int | None = Field(default=None, ge=1, le=32)
    rasterFilter: str | None = Field(default=None, min_length=1, max_length=128)
    declaredDpiX: float | None = Field(default=None, gt=0.0, le=2400.0)
    declaredDpiY: float | None = Field(default=None, gt=0.0, le=2400.0)
    printedLabelCandidates: list[PrintedLabelCandidate] = Field(default_factory=list, max_length=32)
    normalizedPrintedLabel: str | None = None
    printedLabelBox: NormalizedBox | None = None
    printedLabelSource: Literal["embedded_ocr_heuristic", "manifest_override", "missing"]
    sourceImageSha256: str | None = None
    visualDhash64: str
    embeddedTextSha256: str | None = None
    textSimhash64: str | None = None
    duplicateCandidates: list[DuplicateCandidate] = Field(default_factory=list, max_length=1999)
    anomalyFlags: list[AnomalyFlag] = Field(default_factory=list, max_length=8)
    canonicalStatus: Literal["include", "exclude_duplicate", "exclude_nonbody", "pending_review"]
    duplicateOf: InventoryPageRef | None = None
    canonicalSequenceIndex: int | None = Field(default=None, ge=1, le=2000)
    continuityBreakBefore: bool
    decisionReason: str | None = Field(default=None, min_length=1, max_length=512)

    @field_validator("mediaBox")
    @classmethod
    def _validate_media_box(cls, value: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
        for coordinate in value:
            _require_finite(coordinate)
        if value[2] <= value[0] or value[3] <= value[1]:
            raise ValueError("mediaBox must have positive width and height")
        return value

    @field_validator("declaredDpiX", "declaredDpiY")
    @classmethod
    def _validate_dpi(cls, value: float | None) -> float | None:
        return None if value is None else _require_finite(value)

    @field_validator("normalizedPrintedLabel")
    @classmethod
    def _validate_label(cls, value: str | None) -> str | None:
        return None if value is None else _require_printed_label(value)

    @field_validator("sourceImageSha256", "embeddedTextSha256")
    @classmethod
    def _validate_optional_hash(cls, value: str | None) -> str | None:
        return None if value is None else _require_sha256(value)

    @field_validator("visualDhash64")
    @classmethod
    def _validate_dhash(cls, value: str) -> str:
        return _require_hex64(value)

    @field_validator("textSimhash64")
    @classmethod
    def _validate_simhash(cls, value: str | None) -> str | None:
        return None if value is None else _require_hex64(value)

    @field_validator("anomalyFlags")
    @classmethod
    def _validate_anomalies(cls, value: list[AnomalyFlag]) -> list[AnomalyFlag]:
        if value != sorted(set(value)):
            raise ValueError("anomalyFlags must be unique and sorted")
        return value

    @field_validator("decisionReason")
    @classmethod
    def _validate_decision_reason(cls, value: str | None) -> str | None:
        return None if value is None else _require_nonblank(value)

    @model_validator(mode="after")
    def _validate_record(self) -> "PageInventoryRecord":
        candidate_keys = [
            _physical_sort_key(item.pdfPage, item.side) for item in self.duplicateCandidates
        ]
        if candidate_keys != sorted(set(candidate_keys)):
            raise ValueError("duplicateCandidates must be unique and sorted")

        if self.canonicalStatus == "include":
            if self.duplicateOf is not None or self.canonicalSequenceIndex is None:
                raise ValueError("include requires an index and cannot have duplicateOf")
        elif self.canonicalStatus == "exclude_duplicate":
            if self.duplicateOf is None or self.canonicalSequenceIndex is not None:
                raise ValueError("exclude_duplicate requires duplicateOf and no index")
        elif self.canonicalStatus == "exclude_nonbody":
            if self.duplicateOf is not None or self.canonicalSequenceIndex is not None or self.decisionReason is None:
                raise ValueError("exclude_nonbody requires a reason and no duplicate/index")
        elif self.duplicateOf is not None or self.canonicalSequenceIndex is not None:
            raise ValueError("pending_review cannot have duplicateOf or index")
        return self


class DuplicateDecisionSnapshot(_StrictModel):
    first: InventoryPageRef
    second: InventoryPageRef
    decision: Literal["confirmed_duplicate", "false_positive"]
    canonical: InventoryPageRef | None
    reason: str = Field(min_length=1, max_length=512)

    @field_validator("reason")
    @classmethod
    def _validate_reason(cls, value: str) -> str:
        return _require_nonblank(value)

    @model_validator(mode="after")
    def _validate_snapshot(self) -> "DuplicateDecisionSnapshot":
        if _page_ref_key(self.first) >= _page_ref_key(self.second):
            raise ValueError("first must precede second")
        if self.decision == "false_positive" and self.canonical is not None:
            raise ValueError("false_positive cannot have canonical")
        if self.decision == "confirmed_duplicate" and self.canonical is None:
            raise ValueError("confirmed_duplicate requires canonical")
        return self


class PageOverrideSnapshot(_StrictModel):
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
        return None if value is None else _require_printed_label(value)

    @field_validator("reason")
    @classmethod
    def _validate_reason(cls, value: str) -> str:
        return _require_nonblank(value)

    @model_validator(mode="after")
    def _validate_override(self) -> "PageOverrideSnapshot":
        if (
            self.normalizedPrintedLabel is None
            and self.canonicalStatus is None
            and self.canonicalSequenceIndex is None
        ):
            raise ValueError("override requires a label, canonical status, or sequence index")
        if self.canonicalStatus == "exclude_nonbody" and self.canonicalSequenceIndex is not None:
            raise ValueError("exclude_nonbody cannot have canonicalSequenceIndex")
        return self


class CanonicalizationSnapshot(_StrictModel):
    defaultStatus: Literal["include"]
    defaultOrder: Literal["source_order"]
    duplicateDecisions: list[DuplicateDecisionSnapshot] = Field(default_factory=list, max_length=2000)
    pageOverrides: list[PageOverrideSnapshot] = Field(default_factory=list, max_length=2000)

    @model_validator(mode="after")
    def _validate_order(self) -> "CanonicalizationSnapshot":
        decision_keys = [(_page_ref_key(item.first), _page_ref_key(item.second)) for item in self.duplicateDecisions]
        if decision_keys != sorted(set(decision_keys)):
            raise ValueError("duplicateDecisions must be unique and sorted")
        override_keys = [
            _physical_sort_key(item.pdfPage, item.side) for item in self.pageOverrides
        ]
        if override_keys != sorted(set(override_keys)):
            raise ValueError("pageOverrides must be unique and sorted")
        return self


class StagedPage(_StrictModel):
    schemaVersion: Literal[1]
    canonicalPdfSha256: str
    pageInventorySha256: str
    processingFingerprint: str
    pageArtifactHash: str
    page: SourcePageInput

    @field_validator(
        "canonicalPdfSha256", "pageInventorySha256", "processingFingerprint", "pageArtifactHash"
    )
    @classmethod
    def _validate_hashes(cls, value: str) -> str:
        return _require_sha256(value)


class ModelLockFile(_FrozenStrictModel):
    relativePath: str = Field(min_length=1, max_length=512)
    sizeBytes: int = Field(ge=1, le=2**63 - 1)
    sha256: str

    @field_validator("relativePath")
    @classmethod
    def _validate_path(cls, value: str) -> str:
        return _require_safe_relative_path(value)

    @field_validator("sha256")
    @classmethod
    def _validate_hash(cls, value: str) -> str:
        return _require_sha256(value)


class ModelLockEntry(_StrictModel):
    name: str = Field(min_length=1, max_length=128)
    cacheRelativePath: str = Field(min_length=1, max_length=512)
    files: list[ModelLockFile] = Field(min_length=1, max_length=4096)

    @field_validator("cacheRelativePath")
    @classmethod
    def _validate_cache_path(cls, value: str) -> str:
        return _require_safe_relative_path(value)

    @field_validator("files")
    @classmethod
    def _validate_files(cls, value: list[ModelLockFile]) -> list[ModelLockFile]:
        paths = [item.relativePath for item in value]
        if paths != sorted(set(paths)):
            raise ValueError("files must be unique and sorted by relativePath")
        return value


class ModelLock(_StrictModel):
    schemaVersion: Literal[1]
    paddleOcrVersion: str = Field(min_length=1, max_length=64)
    paddleXVersion: str = Field(min_length=1, max_length=64)
    transformersVersion: str = Field(min_length=1, max_length=64)
    engine: Literal["transformers"]
    models: list[ModelLockEntry] = Field(min_length=1, max_length=8)

    @field_validator("models")
    @classmethod
    def _validate_models(cls, value: list[ModelLockEntry]) -> list[ModelLockEntry]:
        names = [item.name for item in value]
        if names != sorted(set(names)):
            raise ValueError("models must be unique and sorted by name")
        cache_paths = [item.cacheRelativePath for item in value]
        if len(cache_paths) != len(set(cache_paths)):
            raise ValueError("model cacheRelativePath values must be unique")
        return value


class ModelLockFingerprintEntry(_FrozenStrictModel):
    name: str = Field(min_length=1, max_length=128)
    files: tuple[ModelLockFile, ...] = Field(min_length=1, max_length=4096)

    @field_validator("files")
    @classmethod
    def _validate_files(cls, value: tuple[ModelLockFile, ...]) -> tuple[ModelLockFile, ...]:
        paths = [item.relativePath for item in value]
        if paths != sorted(set(paths)):
            raise ValueError("files must be unique and sorted by relativePath")
        return value


class ModelLockFingerprint(_FrozenStrictModel):
    schemaVersion: Literal[1]
    paddleOcrVersion: str = Field(min_length=1, max_length=64)
    paddleXVersion: str = Field(min_length=1, max_length=64)
    transformersVersion: str = Field(min_length=1, max_length=64)
    engine: Literal["transformers"]
    models: tuple[ModelLockFingerprintEntry, ...] = Field(min_length=1, max_length=8)

    @field_validator("models")
    @classmethod
    def _validate_models(cls, value: tuple[ModelLockFingerprintEntry, ...]) -> tuple[ModelLockFingerprintEntry, ...]:
        names = [item.name for item in value]
        if names != sorted(set(names)):
            raise ValueError("models must be unique and sorted by name")
        return value

    @classmethod
    def from_model_lock(cls, lock: ModelLock) -> "ModelLockFingerprint":
        return cls(
            schemaVersion=lock.schemaVersion,
            paddleOcrVersion=lock.paddleOcrVersion,
            paddleXVersion=lock.paddleXVersion,
            transformersVersion=lock.transformersVersion,
            engine=lock.engine,
            models=tuple(
                ModelLockFingerprintEntry(name=model.name, files=tuple(model.files))
                for model in lock.models
            ),
        )


class CandidatePdfPageRange(_FrozenStrictModel):
    start: int = Field(ge=1, le=1000)
    end: int = Field(ge=1, le=1000)

    @model_validator(mode="after")
    def _validate_range(self) -> "CandidatePdfPageRange":
        if self.start > self.end:
            raise ValueError("start must be <= end")
        return self


class TableRegionFingerprint(_FrozenStrictModel):
    box: NormalizedBox
    ocrRotationDegrees: Literal[90, 270] | None = None


class LeafOverrideFingerprint(_FrozenStrictModel):
    pdfPage: int = Field(ge=1, le=1000)
    side: Literal["left", "right", "full"]
    contentClass: Literal["normal", "table", "mixed_orientation"]
    rotationDegrees: Literal[0, 90, 180, 270]
    tableRegions: tuple[TableRegionFingerprint, ...] = Field(default_factory=tuple, max_length=32)

    @model_validator(mode="after")
    def _validate_table_regions(self) -> "LeafOverrideFingerprint":
        boxes = [item.box for item in self.tableRegions]
        for i, box in enumerate(boxes):
            for j in range(i + 1, len(boxes)):
                other = boxes[j]
                if not (box.x1 <= other.x0 or other.x1 <= box.x0 or box.y1 <= other.y0 or other.y1 <= box.y0):
                    raise ValueError("tableRegions must be non-overlapping")
        return self


class LeafGeometryFingerprint(_FrozenStrictModel):
    pdfPage: int = Field(ge=1, le=1000)
    side: Literal["left", "right", "full"]
    cropBox: NormalizedBox
    rotationDegrees: Literal[0, 90, 180, 270]
    widthPx: int = Field(ge=1, le=100000)
    heightPx: int = Field(ge=1, le=100000)


class FingerprintSource(_FrozenStrictModel):
    canonicalPdfSha256: str

    @field_validator("canonicalPdfSha256")
    @classmethod
    def _validate_hash(cls, value: str) -> str:
        return _require_sha256(value)


class FingerprintSelection(_FrozenStrictModel):
    candidatePdfPageRanges: tuple[CandidatePdfPageRange, ...] = Field(min_length=1, max_length=128)
    pageInventorySha256: str
    splitSpreads: bool
    gutterRatio: float = Field(ge=0.45, le=0.55)
    innerGutterTrimRatio: float = Field(ge=0.0, le=0.02)
    canonicalization: CanonicalizationSnapshot
    leafOverrides: tuple[LeafOverrideFingerprint, ...] = Field(default_factory=tuple, max_length=2000)
    leafGeometry: tuple[LeafGeometryFingerprint, ...] = Field(default_factory=tuple, max_length=2000)

    @field_validator("pageInventorySha256")
    @classmethod
    def _validate_hash(cls, value: str) -> str:
        return _require_sha256(value)

    @field_validator("gutterRatio", "innerGutterTrimRatio")
    @classmethod
    def _validate_ratios(cls, value: float) -> float:
        return _require_finite(value)

    @model_validator(mode="after")
    def _validate_selection(self) -> "FingerprintSelection":
        previous_end: int | None = None
        for item in self.candidatePdfPageRanges:
            if previous_end is not None and item.start <= previous_end:
                raise ValueError("candidatePdfPageRanges must be ordered and non-overlapping")
            previous_end = item.end

        override_keys = [
            _physical_sort_key(item.pdfPage, item.side) for item in self.leafOverrides
        ]
        if override_keys != sorted(set(override_keys)):
            raise ValueError("leafOverrides must be unique and sorted by pdfPage/side")

        geometry_keys = [
            _physical_sort_key(item.pdfPage, item.side) for item in self.leafGeometry
        ]
        if geometry_keys != sorted(set(geometry_keys)):
            raise ValueError("leafGeometry must be unique and sorted by pdfPage/side")
        return self


class SoftwareVersions(_FrozenStrictModel):
    pymupdf: str = Field(min_length=1, max_length=64)
    paddleocr: str = Field(min_length=1, max_length=64)
    paddlex: str = Field(min_length=1, max_length=64)
    transformers: str = Field(min_length=1, max_length=64)
    torch: str = Field(min_length=1, max_length=64)
    numpy: str = Field(min_length=1, max_length=64)


class RenderFingerprint(_FrozenStrictModel):
    dpi: int = Field(ge=150, le=400)
    rasterizationPolicy: str = Field(min_length=1, max_length=128)


class OcrFingerprint(_FrozenStrictModel):
    textMode: Literal["ocr"]
    engine: Literal["transformers"]
    device: Literal["cpu"]
    detectionModel: str = Field(min_length=1, max_length=128)
    recognitionModel: str = Field(min_length=1, max_length=128)
    language: Literal["es"]
    documentOrientationClassification: Literal[False]
    documentUnwarping: Literal[False]
    textLineOrientation: Literal[True]


class EmbeddedFirstOcrFingerprint(_FrozenStrictModel):
    textMode: Literal["embedded_first"]
    engine: Literal["transformers"]
    device: Literal["cpu"]
    detectionModel: str = Field(min_length=1, max_length=128)
    recognitionModel: str = Field(min_length=1, max_length=128)
    language: Literal["es"]
    documentOrientationClassification: Literal[False]
    documentUnwarping: Literal[False]
    textLineOrientation: Literal[True]
    embeddedPolicy: Literal["madoz-embedded-v1"]
    embeddedMinCharacters: int = Field(ge=1, le=1000000)
    embeddedMinAlphabeticRatio: float = Field(ge=0.0, le=1.0)
    embeddedMaxTokenRepetitionRatio: float = Field(ge=0.0, le=1.0)

    @field_validator(
        "embeddedMinAlphabeticRatio",
        "embeddedMaxTokenRepetitionRatio",
    )
    @classmethod
    def _validate_embedded_ratio(cls, value: float) -> float:
        return _require_finite(value)


OcrFingerprintPayload = Annotated[
    OcrFingerprint | EmbeddedFirstOcrFingerprint,
    Field(discriminator="textMode"),
]


class QualityFingerprint(_FrozenStrictModel):
    lowConfidenceThreshold: float = Field(ge=0.0, le=1.0)

    @field_validator("lowConfidenceThreshold")
    @classmethod
    def _validate_threshold(cls, value: float) -> float:
        return _require_finite(value)


class PolicyFingerprint(_FrozenStrictModel):
    layoutPolicy: Literal["madoz-two-column-v1"]
    entryPolicy: Literal["madoz-entry-v1"]


class ChunkingFingerprint(_FrozenStrictModel):
    maxChunkChars: int = Field(ge=256, le=65536)
    overlapLines: int = Field(ge=0, le=32)


class CorrectionFingerprint(_FrozenStrictModel):
    setRelativePath: str = Field(min_length=1, max_length=512)
    setSha256: str
    authority: Literal["ai_adjudicated"]
    reviewStatus: Literal["ai_adjudicated_not_human_certified"]

    @field_validator("setRelativePath")
    @classmethod
    def _validate_path(cls, value: str) -> str:
        return _require_safe_relative_path(value)

    @field_validator("setSha256")
    @classmethod
    def _validate_hash(cls, value: str) -> str:
        return _require_sha256(value)


class FingerprintPayload(_FrozenStrictModel):
    fingerprintSchemaVersion: Literal[1]
    manifestSchemaVersion: Literal[1]
    source: FingerprintSource
    selection: FingerprintSelection
    software: SoftwareVersions
    render: RenderFingerprint
    ocr: OcrFingerprintPayload
    modelLock: ModelLockFingerprint
    quality: QualityFingerprint
    policies: PolicyFingerprint
    chunking: ChunkingFingerprint
    corrections: CorrectionFingerprint | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )

    def fingerprint(self) -> str:
        return "sha256:" + hashlib.sha256(canonical_json_bytes(self.model_dump(mode="json", by_alias=True, exclude_none=False))).hexdigest()


def _validate_page_processing_metadata(
    page: SourcePageInput,
    processing: FingerprintPayload,
) -> None:
    if page.renderDpi != processing.render.dpi:
        raise ValueError("page renderDpi must equal processing.render.dpi")
    if page.rasterizationPolicy != processing.render.rasterizationPolicy:
        raise ValueError(
            "page rasterizationPolicy must equal processing.render.rasterizationPolicy"
        )
    if page.textSource == "ppocrv6":
        if page.ocrEngine != processing.ocr.engine:
            raise ValueError("page ocrEngine must equal processing.ocr.engine")
        if page.ocrDetectionModel != processing.ocr.detectionModel:
            raise ValueError(
                "page ocrDetectionModel must equal processing.ocr.detectionModel"
            )
        if page.ocrRecognitionModel != processing.ocr.recognitionModel:
            raise ValueError(
                "page ocrRecognitionModel must equal processing.ocr.recognitionModel"
            )
        if page.ocrEngineVersion != processing.software.paddleocr:
            raise ValueError(
                "page ocrEngineVersion must equal processing.software.paddleocr"
            )
        return

    if page.ocrEngine != "pymupdf":
        raise ValueError("embedded page ocrEngine must be pymupdf")
    if page.ocrEngineVersion != processing.software.pymupdf:
        raise ValueError(
            "embedded page ocrEngineVersion must equal processing.software.pymupdf"
        )
    if (
        page.ocrDetectionModel != "pdf-text-layer"
        or page.ocrRecognitionModel != "pdf-text-layer"
    ):
        raise ValueError("embedded page OCR models must identify pdf-text-layer")


def _require_aware_datetime(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("must include a timezone")
    return value


class PreparedChunkInput(ChunkInput):
    chunkId: str
    entryTitle: str = Field(min_length=2, max_length=100)
    lineIds: list[str] = Field(min_length=1, max_length=512)

    @field_validator("chunkId")
    @classmethod
    def _validate_chunk_id(cls, value: str) -> str:
        return _require_sha256(value)

    @field_validator("lineIds")
    @classmethod
    def _validate_line_ids(cls, value: list[str]) -> list[str]:
        for item in value:
            _require_sha256(item)
        if len(value) != len(set(value)):
            raise ValueError("lineIds must be unique")
        return value


class PreparedDocument(_StrictModel):
    schemaVersion: Literal[1]
    preparedDocumentHash: str
    metadata: DocumentMetadata
    publicationGate: PublicationGateSnapshot
    chunks: list[PreparedChunkInput] = Field(min_length=1, max_length=4096)
    pages: list[SourcePageInput] = Field(min_length=1, max_length=2000)
    pageArtifactHashes: list[str] = Field(min_length=1, max_length=2000)
    pageInventorySha256: str
    inventoryVerifiedAt: datetime
    inventoryRecords: list[PageInventoryRecord] = Field(min_length=1, max_length=2000)
    canonicalization: CanonicalizationSnapshot
    canonicalPdfRelativePath: str
    processing: FingerprintPayload
    processingFingerprint: str
    preparedAt: datetime

    @field_validator("preparedDocumentHash", "pageInventorySha256", "processingFingerprint")
    @classmethod
    def _validate_hashes(cls, value: str) -> str:
        return _require_sha256(value)

    @field_validator("pageArtifactHashes")
    @classmethod
    def _validate_page_hashes(cls, value: list[str]) -> list[str]:
        for item in value:
            _require_sha256(item)
        return value

    @field_validator("inventoryVerifiedAt", "preparedAt")
    @classmethod
    def _validate_datetimes(cls, value: datetime) -> datetime:
        return _require_aware_datetime(value)

    @field_validator("canonicalPdfRelativePath")
    @classmethod
    def _validate_path(cls, value: str) -> str:
        return _require_safe_relative_path(value)

    @model_validator(mode="after")
    def _validate_document(self) -> "PreparedDocument":
        if len(self.pageArtifactHashes) != len(self.pages):
            raise ValueError("pageArtifactHashes must match pages count")

        previous_page: int | None = None
        for page in self.pages:
            if previous_page is not None and page.logicalPageNumber <= previous_page:
                raise ValueError("pages must be strictly ordered by logicalPageNumber")
            previous_page = page.logicalPageNumber

        previous_record: tuple[int, int] | None = None
        for record in self.inventoryRecords:
            key = _physical_sort_key(record.pdfPage, record.side)
            if previous_record is not None and key <= previous_record:
                raise ValueError("inventoryRecords must be strictly ordered by pdfPage/side")
            previous_record = key

        chunk_ids = [chunk.chunkId for chunk in self.chunks]
        if len(chunk_ids) != len(set(chunk_ids)):
            raise ValueError("chunks must have unique chunkId")

        include_count = sum(1 for record in self.inventoryRecords if record.canonicalStatus == "include")
        if include_count != len(self.pages):
            raise ValueError("inventoryRecords include count must match pages count")

        for field in (
            "workId",
            "volumeNumber",
            "repositoryName",
            "historicalPeriod",
            "temporalScope",
            "attribution",
            "sourceIsExactRecord",
            "canonicalPdfSha256",
            "processingFingerprint",
            "pageInventorySha256",
            "coverageStatus",
            "coverageAcceptedForProduct",
        ):
            if getattr(self.metadata, field) is None:
                raise ValueError(f"metadata.{field} must be non-null")

        gate = self.publicationGate
        if self.metadata.sourceIsExactRecord != gate.sourceIsExactRecord:
            raise ValueError("metadata.sourceIsExactRecord must equal publicationGate.sourceIsExactRecord")
        coverage = gate.coverage
        if self.metadata.coverageStatus != coverage.status:
            raise ValueError("metadata.coverageStatus must equal publicationGate coverage status")
        if self.metadata.coverageStatement != coverage.statement:
            raise ValueError("metadata.coverageStatement must equal publicationGate coverage statement")
        if self.metadata.observedPrintedRanges != coverage.observedPrintedRanges:
            raise ValueError("metadata.observedPrintedRanges must equal publicationGate coverage observedPrintedRanges")
        if self.metadata.missingPrintedPages != coverage.missingPrintedPages:
            raise ValueError("metadata.missingPrintedPages must equal publicationGate coverage missingPrintedPages")
        if self.metadata.coverageAcceptedForProduct != coverage.acceptedForProduct:
            raise ValueError("metadata.coverageAcceptedForProduct must equal publicationGate coverage acceptedForProduct")
        if self.metadata.coverageAcceptedAt is not None:
            if coverage.acceptedAt is None:
                raise ValueError("metadata.coverageAcceptedAt must equal publicationGate coverage acceptedAt")
            metadata_accepted_at = datetime.fromisoformat(
                self.metadata.coverageAcceptedAt.replace("Z", "+00:00")
            )
            if metadata_accepted_at.isoformat() != coverage.acceptedAt.isoformat():
                raise ValueError("metadata.coverageAcceptedAt must equal publicationGate coverage acceptedAt")
        elif coverage.acceptedAt is not None:
            raise ValueError("metadata.coverageAcceptedAt must equal publicationGate coverage acceptedAt")

        if self.metadata.contentHash != self.metadata.canonicalPdfSha256:
            raise ValueError("metadata.contentHash must equal metadata.canonicalPdfSha256")
        if self.metadata.canonicalPdfSha256 != self.processing.source.canonicalPdfSha256:
            raise ValueError("metadata.canonicalPdfSha256 must equal processing.source.canonicalPdfSha256")

        processing_fingerprint = self.processing.fingerprint()
        if processing_fingerprint != self.processingFingerprint:
            raise ValueError("processing.fingerprint() must equal top processingFingerprint")
        if self.processingFingerprint != self.metadata.processingFingerprint:
            raise ValueError("top processingFingerprint must equal metadata.processingFingerprint")

        if self.processing.selection.pageInventorySha256 != self.pageInventorySha256:
            raise ValueError("processing.selection.pageInventorySha256 must equal top pageInventorySha256")
        if self.pageInventorySha256 != self.metadata.pageInventorySha256:
            raise ValueError("top pageInventorySha256 must equal metadata.pageInventorySha256")

        if self.processing.selection.canonicalization != self.canonicalization:
            raise ValueError("processing.selection.canonicalization must equal top canonicalization")

        inventory_bytes = b""
        for record in self.inventoryRecords:
            inventory_bytes += canonical_json_bytes(record.model_dump(mode="json", by_alias=True, exclude_none=False)) + b"\n"
        inventory_digest = "sha256:" + hashlib.sha256(inventory_bytes).hexdigest()
        if inventory_digest != self.pageInventorySha256:
            raise ValueError("inventory JSONL sha256 must equal pageInventorySha256")

        include_records = [record for record in self.inventoryRecords if record.canonicalStatus == "include"]
        include_records.sort(key=lambda record: record.canonicalSequenceIndex or 0)
        if len(include_records) != len(self.pages):
            raise ValueError("include inventory records must map one-to-one to pages")
        for record, page in zip(include_records, self.pages):
            if record.pdfPage != page.sourcePdfPageNumber:
                raise ValueError("include inventory pdfPage must equal page sourcePdfPageNumber")
            if record.side != page.leafSide:
                raise ValueError("include inventory side must equal page leafSide")
            if record.canonicalSequenceIndex != page.logicalPageNumber:
                raise ValueError("include inventory canonicalSequenceIndex must equal page logicalPageNumber")
            if record.normalizedPrintedLabel != page.printedPageLabel:
                raise ValueError("include inventory normalizedPrintedLabel must equal page printedPageLabel")
            if record.continuityBreakBefore != page.continuityBreakBefore:
                raise ValueError("include inventory continuityBreakBefore must equal page continuityBreakBefore")

        inventory_keys = [
            _physical_sort_key(record.pdfPage, record.side) for record in self.inventoryRecords
        ]
        geometry_keys = [
            _physical_sort_key(item.pdfPage, item.side)
            for item in self.processing.selection.leafGeometry
        ]
        if geometry_keys != inventory_keys:
            raise ValueError("processing.selection.leafGeometry must map one-to-one to all inventory records")

        geometry_lookup: dict[tuple[int, str], LeafGeometryFingerprint] = {}
        for geometry in self.processing.selection.leafGeometry:
            key = _physical_ref_key(geometry.pdfPage, geometry.side)
            if key in geometry_lookup:
                raise ValueError("leafGeometry must have unique physical refs")
            geometry_lookup[key] = geometry

        for page in self.pages:
            key = _physical_ref_key(page.sourcePdfPageNumber, page.leafSide)
            geometry = geometry_lookup.get(key)
            if geometry is None:
                raise ValueError("each page must have a matching leafGeometry entry")
            if geometry.cropBox != page.cropBox:
                raise ValueError("leafGeometry cropBox must match page cropBox")
            if geometry.rotationDegrees != page.rotationDegrees:
                raise ValueError("leafGeometry rotationDegrees must match page rotationDegrees")
            if geometry.widthPx != page.widthPx:
                raise ValueError("leafGeometry widthPx must match page widthPx")
            if geometry.heightPx != page.heightPx:
                raise ValueError("leafGeometry heightPx must match page heightPx")

        for record in self.inventoryRecords:
            contained = False
            for range_item in self.processing.selection.candidatePdfPageRanges:
                if range_item.start <= record.pdfPage <= range_item.end:
                    contained = True
                    break
            if not contained:
                raise ValueError("every inventory pdfPage must be contained in exactly one candidatePdfPageRanges range")

        for page in self.pages:
            if page.documentId != self.metadata.documentId:
                raise ValueError("page.documentId must equal metadata.documentId")
            expected_page_id = compute_page_id(
                self.metadata.documentId,
                page.sourcePdfPageNumber,
                page.leafSide,
                page.cropBox,
                page.rotationDegrees,
                page.imageSha256,
            )
            if page.pageId != expected_page_id:
                raise ValueError("pageId must equal recomputed page identity")

        line_lookup: dict[str, tuple[SourceLineInput, int]] = {}
        for page in self.pages:
            for line in page.lines:
                expected_line_id = compute_line_id(page.pageId, line.lineOrder, line.originalText, line.box)
                if line.lineId != expected_line_id:
                    raise ValueError("lineId must equal recomputed line identity")
                if line.lineId in line_lookup:
                    raise ValueError("lineId must be globally unique")
                line_lookup[line.lineId] = (line, page.logicalPageNumber)

        for page in self.pages:
            expected_original_text = "\n".join(line.originalText for line in page.lines)
            if page.originalText != expected_original_text:
                raise ValueError("page.originalText must join all its lines with newline")

        for index, page in enumerate(self.pages):
            expected_artifact = "sha256:" + hashlib.sha256(
                canonical_json_bytes(page.model_dump(mode="json", by_alias=True, exclude_none=False))
            ).hexdigest()
            if self.pageArtifactHashes[index] != expected_artifact:
                raise ValueError("pageArtifactHashes must equal sha256 of canonical page JSON in page order")

        for chunk in self.chunks:
            if not chunk.lineIds:
                raise ValueError("chunk.lineIds must be non-empty")
            referenced_lines: list[SourceLineInput] = []
            referenced_positions: list[tuple[int, int]] = []
            for line_id in chunk.lineIds:
                if line_id not in line_lookup:
                    raise ValueError("chunk lineIds must reference existing lines")
                line, logical_page_number = line_lookup[line_id]
                if line.role not in {"body", "table"}:
                    raise ValueError("chunk lineIds must reference only body or table lines")
                referenced_lines.append(line)
                referenced_positions.append((logical_page_number, line.lineOrder))
            if len({line.role for line in referenced_lines}) != 1:
                raise ValueError("chunk lineIds must reference role-homogeneous lines")
            if referenced_positions != sorted(set(referenced_positions)):
                raise ValueError("chunk lineIds must reference sorted unique positions")

            chunk_original_text = "\n".join(line.originalText for line in referenced_lines)
            if chunk.originalText != chunk_original_text:
                raise ValueError("chunk.originalText must join its lineIds with newline")

            page_numbers = [logical_page_number for logical_page_number, _ in referenced_positions]
            page_start = min(page_numbers)
            page_end = max(page_numbers)
            if chunk.pageStart != page_start:
                raise ValueError("chunk.pageStart must equal min logical page of its lines")
            if chunk.pageEnd != page_end:
                raise ValueError("chunk.pageEnd must equal max logical page of its lines")

            total_weighted = math.fsum(
                len(line.originalText) * line.confidence for line in referenced_lines
            )
            total_length = sum(len(line.originalText) for line in referenced_lines)
            expected_confidence = total_weighted / total_length
            if abs(chunk.ocrConfidence - expected_confidence) > 1e-12:
                raise ValueError("chunk.ocrConfidence must equal weighted average within 1e-12")

            if len(set(page_numbers)) > 1:
                for page in self.pages:
                    if (
                        page_start < page.logicalPageNumber <= page_end
                        and page.continuityBreakBefore
                    ):
                        raise ValueError("chunk must not cross a referenced later page with continuityBreakBefore=true")

            expected_section_path = ["Diccionario Madoz", self.metadata.edition, chunk.entryTitle]
            if chunk.sectionPath != expected_section_path:
                raise ValueError("chunk.sectionPath must equal ['Diccionario Madoz', metadata.edition, entryTitle]")
            expected_corrected_text = "\n".join(
                line.correctedText or line.originalText for line in referenced_lines
            )
            has_corrections = any(line.correctedText is not None for line in referenced_lines)
            if has_corrections and chunk.correctedText != expected_corrected_text:
                raise ValueError(
                    "chunk.correctedText must join correctedText-or-originalText for its lineIds"
                )
            if not has_corrections and chunk.correctedText is not None:
                raise ValueError("chunk.correctedText must be None when its lines are uncorrected")
            if chunk.cityQids != []:
                raise ValueError("chunk.cityQids must be empty")
            if chunk.entityQids != []:
                raise ValueError("chunk.entityQids must be empty")
            if chunk.historicalPeriod != self.metadata.historicalPeriod:
                raise ValueError("chunk.historicalPeriod must equal metadata.historicalPeriod")
            if len(chunk.originalText) > self.processing.chunking.maxChunkChars:
                raise ValueError("chunk.originalText length must not exceed processing.chunking.maxChunkChars")
            if (
                chunk.correctedText is not None
                and len(chunk.correctedText) > self.processing.chunking.maxChunkChars
            ):
                raise ValueError(
                    "chunk.correctedText length must not exceed processing.chunking.maxChunkChars"
                )

            expected_chunk_id = compute_chunk_id(
                self.metadata.documentId,
                page_start,
                page_end,
                chunk.sectionPath,
                chunk.originalText,
            )
            if chunk.chunkId != expected_chunk_id:
                raise ValueError("chunkId must equal recomputed chunk identity")

        chunk_order_keys: list[tuple[int, int, int, int, str]] = []
        for chunk in self.chunks:
            positions = [(line_lookup[line_id][1], line_lookup[line_id][0].lineOrder) for line_id in chunk.lineIds]
            first_page, first_line = positions[0]
            last_page, last_line = positions[-1]
            chunk_order_keys.append((first_page, first_line, last_page, last_line, chunk.chunkId))
        if chunk_order_keys != sorted(chunk_order_keys):
            raise ValueError("chunks must be ordered by (firstPage, firstLine, lastPage, lastLine, chunkId)")

        line_chunk_indexes: dict[str, list[int]] = {}
        for index, chunk in enumerate(self.chunks):
            for line_id in chunk.lineIds:
                line_chunk_indexes.setdefault(line_id, []).append(index)
        for line_id, indexes in line_chunk_indexes.items():
            if indexes != list(range(indexes[0], indexes[-1] + 1)):
                raise ValueError(f"lineId {line_id} chunk indexes must form one consecutive integer run")

        overlap_lines = self.processing.chunking.overlapLines
        max_chunk_chars = self.processing.chunking.maxChunkChars
        for index in range(1, len(self.chunks)):
            previous = self.chunks[index - 1]
            current = self.chunks[index]
            shared_ids = [line_id for line_id in previous.lineIds if line_id in set(current.lineIds)]
            if not shared_ids:
                continue
            if previous.entryTitle != current.entryTitle:
                raise ValueError("consecutive chunks sharing lineIds must have equal entryTitle")
            if shared_ids != previous.lineIds[-len(shared_ids):] or shared_ids != current.lineIds[:len(shared_ids)]:
                raise ValueError("shared lineIds must be exactly a suffix of previous and prefix of current")
            if len(shared_ids) > overlap_lines:
                raise ValueError("overlap length must not exceed processing.chunking.overlapLines")
            if len(current.lineIds) == len(shared_ids):
                raise ValueError("current chunk must contain at least one new lineId after overlap")

            candidate_count = min(overlap_lines, len(previous.lineIds))
            candidate_overlap = list(previous.lineIds[-candidate_count:]) if candidate_count else []
            first_new_id = current.lineIds[len(shared_ids)]
            while candidate_overlap:
                combined_ids = candidate_overlap + [first_new_id]
                combined_text = "\n".join(
                    line_lookup[line_id][0].originalText for line_id in combined_ids
                )
                if len(combined_ids) <= 512 and len(combined_text) <= max_chunk_chars:
                    break
                candidate_overlap = candidate_overlap[1:]
            if candidate_overlap != shared_ids:
                raise ValueError("actual overlap must equal the remaining candidate overlap")

        for page in self.pages:
            _validate_page_processing_metadata(page, self.processing)

        if self.processing.software.paddleocr != self.processing.modelLock.paddleOcrVersion:
            raise ValueError("processing.software.paddleocr must equal modelLock.paddleOcrVersion")
        if self.processing.software.paddlex != self.processing.modelLock.paddleXVersion:
            raise ValueError("processing.software.paddlex must equal modelLock.paddleXVersion")
        if self.processing.software.transformers != self.processing.modelLock.transformersVersion:
            raise ValueError("processing.software.transformers must equal modelLock.transformersVersion")

        override_lookup: dict[tuple[int, str], PageOverrideSnapshot] = {}
        for override in self.canonicalization.pageOverrides:
            key = _physical_ref_key(override.pdfPage, override.side)
            if key in override_lookup:
                raise ValueError("canonicalization.pageOverrides must have unique physical refs")
            override_lookup[key] = override

        for override in self.canonicalization.pageOverrides:
            key = _physical_ref_key(override.pdfPage, override.side)
            record = next(
                (
                    item
                    for item in self.inventoryRecords
                    if _physical_ref_key(item.pdfPage, item.side) == key
                ),
                None,
            )
            if record is None:
                raise ValueError("canonicalization.pageOverride must match an inventory record")
            if override.normalizedPrintedLabel is not None and override.normalizedPrintedLabel != record.normalizedPrintedLabel:
                raise ValueError("canonicalization.pageOverride.normalizedPrintedLabel must equal inventory record")
            if override.canonicalStatus is not None and override.canonicalStatus != record.canonicalStatus:
                raise ValueError("canonicalization.pageOverride.canonicalStatus must equal inventory record")
            if (
                override.canonicalSequenceIndex is not None
                and override.canonicalSequenceIndex != record.canonicalSequenceIndex
            ):
                raise ValueError(
                    "canonicalization.pageOverride.canonicalSequenceIndex must equal inventory record"
                )
            if record.decisionReason != override.reason:
                raise ValueError("canonicalization.pageOverride.reason must equal inventory record decisionReason")

        inventory_ref_lookup: dict[tuple[int, str], PageInventoryRecord] = {}
        for record in self.inventoryRecords:
            ref_key = _physical_ref_key(record.pdfPage, record.side)
            if ref_key in inventory_ref_lookup:
                raise ValueError("inventoryRecords must have unique physical refs")
            inventory_ref_lookup[ref_key] = record

        for record in self.inventoryRecords:
            if record.canonicalStatus == "pending_review":
                raise ValueError("inventory record canonicalStatus must not be pending_review")

        pair_candidate_map: dict[
            tuple[tuple[int, str], tuple[int, str]],
            list[tuple[PageInventoryRecord, DuplicateCandidate]],
        ] = {}
        for record in self.inventoryRecords:
            for candidate in record.duplicateCandidates:
                if candidate.decision == "pending":
                    raise ValueError("duplicate candidate decision must not be pending")
                target_key = _physical_ref_key(candidate.pdfPage, candidate.side)
                if target_key not in inventory_ref_lookup:
                    raise ValueError("duplicate candidate target must exist in inventory records")
                record_key = _physical_ref_key(record.pdfPage, record.side)
                if record_key == target_key:
                    raise ValueError("duplicate candidate cannot reference itself")
                pair_key = tuple(
                    sorted(
                        (record_key, target_key),
                        key=lambda ref: _physical_sort_key(ref[0], ref[1]),
                    )
                )
                pair_candidate_map.setdefault(pair_key, []).append((record, candidate))

        snapshot_decision_map: dict[
            tuple[tuple[int, str], tuple[int, str]], DuplicateDecisionSnapshot
        ] = {}
        for decision in self.canonicalization.duplicateDecisions:
            first_key = _physical_ref_key(decision.first.pdfPage, decision.first.side)
            second_key = _physical_ref_key(decision.second.pdfPage, decision.second.side)
            pair_key = tuple(
                sorted(
                    (first_key, second_key),
                    key=lambda ref: _physical_sort_key(ref[0], ref[1]),
                )
            )
            if pair_key in snapshot_decision_map:
                raise ValueError("canonicalization.duplicateDecisions must have unique normalized pairs")
            snapshot_decision_map[pair_key] = decision

        if set(pair_candidate_map.keys()) != set(snapshot_decision_map.keys()):
            raise ValueError("duplicate candidate pairs must exactly match canonicalization.duplicateDecisions pairs")

        for pair_key, entries in pair_candidate_map.items():
            decision = snapshot_decision_map[pair_key]
            for record, candidate in entries:
                if candidate.decision != decision.decision:
                    raise ValueError("duplicate candidate decision must equal snapshot decision")
                if candidate.canonical != decision.canonical:
                    raise ValueError("duplicate candidate canonical must equal snapshot canonical")
                if candidate.decisionReason != decision.reason:
                    raise ValueError("duplicate candidate decisionReason must equal snapshot reason")

        confirmed_graph: dict[tuple[int, str], set[tuple[int, str]]] = {}
        for pair_key, decision in snapshot_decision_map.items():
            if decision.decision != "confirmed_duplicate":
                continue
            first_key, second_key = pair_key
            confirmed_graph.setdefault(first_key, set()).add(second_key)
            confirmed_graph.setdefault(second_key, set()).add(first_key)

        unseen = set(confirmed_graph)
        while unseen:
            seed = next(iter(unseen))
            component: set[tuple[int, str]] = set()
            pending = [seed]
            while pending:
                current = pending.pop()
                if current in component:
                    continue
                component.add(current)
                pending.extend(confirmed_graph[current] - component)
            unseen -= component

            component_decisions = [
                decision
                for pair_key, decision in snapshot_decision_map.items()
                if decision.decision == "confirmed_duplicate"
                and pair_key[0] in component
                and pair_key[1] in component
            ]
            canonical_keys = {
                _physical_ref_key(decision.canonical.pdfPage, decision.canonical.side)
                for decision in component_decisions
                if decision.canonical is not None
            }
            if len(canonical_keys) != 1:
                raise ValueError("confirmed duplicate component must name one canonical")
            canonical_key = next(iter(canonical_keys))
            if canonical_key not in component:
                raise ValueError("confirmed duplicate canonical must belong to its component")
            canonical_record = inventory_ref_lookup.get(canonical_key)
            if canonical_record is None:
                raise ValueError("confirmed duplicate canonical must exist in inventory records")
            if canonical_record.canonicalStatus != "include":
                raise ValueError("confirmed duplicate canonical record must be include")
            for ref_key in component:
                record = inventory_ref_lookup.get(ref_key)
                if record is None:
                    raise ValueError("confirmed duplicate component record must exist in inventory records")
                if ref_key == canonical_key:
                    continue
                if record.canonicalStatus != "exclude_duplicate":
                    raise ValueError("confirmed duplicate component non-canonical record must be exclude_duplicate")
                if record.duplicateOf is None:
                    raise ValueError("confirmed duplicate component non-canonical record must have duplicateOf")
                if _physical_ref_key(record.duplicateOf.pdfPage, record.duplicateOf.side) != canonical_key:
                    raise ValueError("confirmed duplicate component non-canonical duplicateOf must equal canonical")

        leaf_override_lookup: dict[tuple[int, str], LeafOverrideFingerprint] = {}
        for leaf_override in self.processing.selection.leafOverrides:
            key = _physical_ref_key(leaf_override.pdfPage, leaf_override.side)
            if key in leaf_override_lookup:
                raise ValueError("processing.selection.leafOverrides must have unique physical refs")
            leaf_override_lookup[key] = leaf_override

        for page in self.pages:
            key = _physical_ref_key(page.sourcePdfPageNumber, page.leafSide)
            leaf_override = leaf_override_lookup.get(key)
            if leaf_override is not None:
                if page.contentClass != leaf_override.contentClass:
                    raise ValueError("page contentClass must match processing.selection.leafOverride.contentClass")
                if page.rotationDegrees != leaf_override.rotationDegrees:
                    raise ValueError("page rotationDegrees must match processing.selection.leafOverride.rotationDegrees")
            else:
                if page.contentClass != "normal":
                    raise ValueError("page contentClass must be normal when no leafOverride exists")
                if page.rotationDegrees != 0:
                    raise ValueError("page rotationDegrees must be 0 when no leafOverride exists")

        expected_path = f"raw/{hashlib.sha256(self.metadata.documentId.encode('utf-8')).hexdigest()}/{self.metadata.canonicalPdfSha256.removeprefix('sha256:')}.pdf"
        if self.canonicalPdfRelativePath != expected_path:
            raise ValueError("canonicalPdfRelativePath must equal derived canonical path")

        projection = self.model_dump(mode="json", by_alias=True, exclude_none=False)
        projection.pop("preparedDocumentHash")
        projection.pop("canonicalPdfRelativePath")
        projection.pop("preparedAt")
        recomputed = "sha256:" + hashlib.sha256(canonical_json_bytes(projection)).hexdigest()
        if recomputed != self.preparedDocumentHash:
            raise ValueError("preparedDocumentHash must equal recomputed outer hash")
        return self


class OcrEvaluationPageRef(_StrictModel):
    pdfPage: int = Field(ge=1, le=1000)
    side: Literal["left", "right", "full"]
    logicalPageNumber: int = Field(ge=1, le=2000)


class OcrEvaluationSample(_StrictModel):
    schemaVersion: Literal[1]
    sampleHash: str
    publishable: Literal[False]
    metadata: DocumentMetadata
    canonicalPdfSha256: str
    pageInventorySha256: str
    inventoryVerifiedAt: datetime
    processing: FingerprintPayload
    processingFingerprint: str
    canonicalization: CanonicalizationSnapshot
    selectedPages: list[OcrEvaluationPageRef] = Field(min_length=1, max_length=64)
    selectedInventoryRecords: list[PageInventoryRecord] = Field(min_length=1, max_length=64)
    pages: list[SourcePageInput] = Field(min_length=1, max_length=64)
    pageArtifactHashes: list[str] = Field(min_length=1, max_length=64)
    chunks: list[PreparedChunkInput] = Field(max_length=4096)
    createdAt: datetime

    @field_validator("sampleHash", "canonicalPdfSha256", "pageInventorySha256", "processingFingerprint")
    @classmethod
    def _validate_hashes(cls, value: str) -> str:
        return _require_sha256(value)

    @field_validator("pageArtifactHashes")
    @classmethod
    def _validate_page_hashes(cls, value: list[str]) -> list[str]:
        for item in value:
            _require_sha256(item)
        return value

    @field_validator("inventoryVerifiedAt", "createdAt")
    @classmethod
    def _validate_datetimes(cls, value: datetime) -> datetime:
        return _require_aware_datetime(value)

    @model_validator(mode="after")
    def _validate_sample(self) -> "OcrEvaluationSample":
        if len(self.selectedPages) != len(self.selectedInventoryRecords) or len(self.selectedPages) != len(self.pages) or len(self.selectedPages) != len(self.pageArtifactHashes):
            raise ValueError("selectedPages, selectedInventoryRecords, pages, and pageArtifactHashes must have equal counts")

        previous_page: int | None = None
        for page in self.selectedPages:
            if previous_page is not None and page.logicalPageNumber <= previous_page:
                raise ValueError("selectedPages must be strictly ordered by logicalPageNumber")
            previous_page = page.logicalPageNumber

        for field in (
            "workId",
            "volumeNumber",
            "repositoryName",
            "historicalPeriod",
            "temporalScope",
            "attribution",
            "sourceIsExactRecord",
            "canonicalPdfSha256",
            "processingFingerprint",
            "pageInventorySha256",
            "coverageStatus",
            "coverageAcceptedForProduct",
        ):
            if getattr(self.metadata, field) is None:
                raise ValueError(f"metadata.{field} must be non-null")

        if self.metadata.contentHash != self.metadata.canonicalPdfSha256:
            raise ValueError("metadata.contentHash must equal metadata.canonicalPdfSha256")
        if self.metadata.canonicalPdfSha256 != self.canonicalPdfSha256:
            raise ValueError("metadata.canonicalPdfSha256 must equal top canonicalPdfSha256")
        if self.canonicalPdfSha256 != self.processing.source.canonicalPdfSha256:
            raise ValueError("top canonicalPdfSha256 must equal processing.source.canonicalPdfSha256")

        processing_fingerprint = self.processing.fingerprint()
        if processing_fingerprint != self.processingFingerprint:
            raise ValueError("processing.fingerprint() must equal top processingFingerprint")
        if self.processingFingerprint != self.metadata.processingFingerprint:
            raise ValueError("top processingFingerprint must equal metadata.processingFingerprint")

        if self.processing.selection.pageInventorySha256 != self.pageInventorySha256:
            raise ValueError("processing.selection.pageInventorySha256 must equal top pageInventorySha256")
        if self.pageInventorySha256 != self.metadata.pageInventorySha256:
            raise ValueError("top pageInventorySha256 must equal metadata.pageInventorySha256")

        if self.processing.selection.canonicalization != self.canonicalization:
            raise ValueError("processing.selection.canonicalization must equal top canonicalization")

        selected_ref_keys = [
            _physical_ref_key(ref.pdfPage, ref.side) for ref in self.selectedPages
        ]
        selected_record_keys = [
            _physical_ref_key(record.pdfPage, record.side)
            for record in self.selectedInventoryRecords
        ]
        page_keys = [
            _physical_ref_key(page.sourcePdfPageNumber, page.leafSide) for page in self.pages
        ]
        if selected_ref_keys != selected_record_keys or selected_ref_keys != page_keys:
            raise ValueError("selected refs, selected inventory records, and pages must match one-to-one by pdfPage/side")

        for ref, record, page in zip(self.selectedPages, self.selectedInventoryRecords, self.pages):
            if ref.pdfPage != record.pdfPage or ref.side != record.side:
                raise ValueError("selected ref must match selected inventory record pdfPage/side")
            if ref.pdfPage != page.sourcePdfPageNumber or ref.side != page.leafSide:
                raise ValueError("selected ref must match page pdfPage/side")
            if ref.logicalPageNumber != page.logicalPageNumber:
                raise ValueError("selected ref logicalPageNumber must match page logicalPageNumber")
            if record.canonicalSequenceIndex != page.logicalPageNumber:
                raise ValueError("selected inventory canonicalSequenceIndex must match page logicalPageNumber")
            if record.normalizedPrintedLabel != page.printedPageLabel:
                raise ValueError("selected inventory normalizedPrintedLabel must match page printedPageLabel")
            if record.continuityBreakBefore != page.continuityBreakBefore:
                raise ValueError("selected inventory continuityBreakBefore must match page continuityBreakBefore")
            if page.documentId != self.metadata.documentId:
                raise ValueError("page.documentId must equal metadata.documentId")

        geometry_lookup: dict[tuple[int, str], LeafGeometryFingerprint] = {}
        for geometry in self.processing.selection.leafGeometry:
            key = _physical_ref_key(geometry.pdfPage, geometry.side)
            if key in geometry_lookup:
                raise ValueError("leafGeometry must have unique physical refs")
            geometry_lookup[key] = geometry

        for page in self.pages:
            key = _physical_ref_key(page.sourcePdfPageNumber, page.leafSide)
            geometry = geometry_lookup.get(key)
            if geometry is None:
                raise ValueError("each selected page must have a matching leafGeometry entry")
            if geometry.cropBox != page.cropBox:
                raise ValueError("leafGeometry cropBox must match page cropBox")
            if geometry.rotationDegrees != page.rotationDegrees:
                raise ValueError("leafGeometry rotationDegrees must match page rotationDegrees")
            if geometry.widthPx != page.widthPx:
                raise ValueError("leafGeometry widthPx must match page widthPx")
            if geometry.heightPx != page.heightPx:
                raise ValueError("leafGeometry heightPx must match page heightPx")

            expected_page_id = compute_page_id(
                self.metadata.documentId,
                page.sourcePdfPageNumber,
                page.leafSide,
                page.cropBox,
                page.rotationDegrees,
                page.imageSha256,
            )
            if page.pageId != expected_page_id:
                raise ValueError("pageId must equal recomputed page identity")

        line_lookup: dict[str, tuple[SourceLineInput, int]] = {}
        for page in self.pages:
            for line in page.lines:
                expected_line_id = compute_line_id(page.pageId, line.lineOrder, line.originalText, line.box)
                if line.lineId != expected_line_id:
                    raise ValueError("lineId must equal recomputed line identity")
                if line.lineId in line_lookup:
                    raise ValueError("lineId must be globally unique")
                line_lookup[line.lineId] = (line, page.logicalPageNumber)

        for page in self.pages:
            expected_original_text = "\n".join(line.originalText for line in page.lines)
            if page.originalText != expected_original_text:
                raise ValueError("page.originalText must join all its lines with newline")

        for index, page in enumerate(self.pages):
            expected_artifact = "sha256:" + hashlib.sha256(
                canonical_json_bytes(page.model_dump(mode="json", by_alias=True, exclude_none=False))
            ).hexdigest()
            if self.pageArtifactHashes[index] != expected_artifact:
                raise ValueError("pageArtifactHashes must equal sha256 of canonical page JSON in page order")

        for chunk in self.chunks:
            if not chunk.lineIds:
                raise ValueError("chunk.lineIds must be non-empty")
            referenced_lines: list[SourceLineInput] = []
            referenced_positions: list[tuple[int, int]] = []
            for line_id in chunk.lineIds:
                if line_id not in line_lookup:
                    raise ValueError("chunk lineIds must reference existing lines")
                line, logical_page_number = line_lookup[line_id]
                if line.role not in {"body", "table"}:
                    raise ValueError("chunk lineIds must reference only body or table lines")
                referenced_lines.append(line)
                referenced_positions.append((logical_page_number, line.lineOrder))
            if len({line.role for line in referenced_lines}) != 1:
                raise ValueError("chunk lineIds must reference role-homogeneous lines")
            if referenced_positions != sorted(set(referenced_positions)):
                raise ValueError("chunk lineIds must reference sorted unique positions")

            chunk_original_text = "\n".join(line.originalText for line in referenced_lines)
            if chunk.originalText != chunk_original_text:
                raise ValueError("chunk.originalText must join its lineIds with newline")

            page_numbers = [logical_page_number for logical_page_number, _ in referenced_positions]
            page_start = min(page_numbers)
            page_end = max(page_numbers)
            if chunk.pageStart != page_start:
                raise ValueError("chunk.pageStart must equal min logical page of its lines")
            if chunk.pageEnd != page_end:
                raise ValueError("chunk.pageEnd must equal max logical page of its lines")

            total_weighted = math.fsum(
                len(line.originalText) * line.confidence for line in referenced_lines
            )
            total_length = sum(len(line.originalText) for line in referenced_lines)
            expected_confidence = total_weighted / total_length
            if abs(chunk.ocrConfidence - expected_confidence) > 1e-12:
                raise ValueError("chunk.ocrConfidence must equal weighted average within 1e-12")

            if len(set(page_numbers)) > 1:
                for page in self.pages:
                    if (
                        page_start < page.logicalPageNumber <= page_end
                        and page.continuityBreakBefore
                    ):
                        raise ValueError("chunk must not cross a referenced later page with continuityBreakBefore=true")

            expected_section_path = ["Diccionario Madoz", self.metadata.edition, chunk.entryTitle]
            if chunk.sectionPath != expected_section_path:
                raise ValueError("chunk.sectionPath must equal ['Diccionario Madoz', metadata.edition, entryTitle]")
            expected_corrected_text = "\n".join(
                line.correctedText or line.originalText for line in referenced_lines
            )
            has_corrections = any(line.correctedText is not None for line in referenced_lines)
            if has_corrections and chunk.correctedText != expected_corrected_text:
                raise ValueError(
                    "chunk.correctedText must join correctedText-or-originalText for its lineIds"
                )
            if not has_corrections and chunk.correctedText is not None:
                raise ValueError("chunk.correctedText must be None when its lines are uncorrected")
            if chunk.cityQids != []:
                raise ValueError("chunk.cityQids must be empty")
            if chunk.entityQids != []:
                raise ValueError("chunk.entityQids must be empty")
            if chunk.historicalPeriod != self.metadata.historicalPeriod:
                raise ValueError("chunk.historicalPeriod must equal metadata.historicalPeriod")
            if len(chunk.originalText) > self.processing.chunking.maxChunkChars:
                raise ValueError("chunk.originalText length must not exceed processing.chunking.maxChunkChars")
            if (
                chunk.correctedText is not None
                and len(chunk.correctedText) > self.processing.chunking.maxChunkChars
            ):
                raise ValueError(
                    "chunk.correctedText length must not exceed processing.chunking.maxChunkChars"
                )

            expected_chunk_id = compute_chunk_id(
                self.metadata.documentId,
                page_start,
                page_end,
                chunk.sectionPath,
                chunk.originalText,
            )
            if chunk.chunkId != expected_chunk_id:
                raise ValueError("chunkId must equal recomputed chunk identity")

        chunk_ids = [chunk.chunkId for chunk in self.chunks]
        if len(chunk_ids) != len(set(chunk_ids)):
            raise ValueError("chunks must have unique chunkId")

        for page in self.pages:
            _validate_page_processing_metadata(page, self.processing)

        if self.processing.software.paddleocr != self.processing.modelLock.paddleOcrVersion:
            raise ValueError("processing.software.paddleocr must equal modelLock.paddleOcrVersion")
        if self.processing.software.paddlex != self.processing.modelLock.paddleXVersion:
            raise ValueError("processing.software.paddlex must equal modelLock.paddleXVersion")
        if self.processing.software.transformers != self.processing.modelLock.transformersVersion:
            raise ValueError("processing.software.transformers must equal modelLock.transformersVersion")

        leaf_override_lookup: dict[tuple[int, str], LeafOverrideFingerprint] = {}
        for leaf_override in self.processing.selection.leafOverrides:
            key = _physical_ref_key(leaf_override.pdfPage, leaf_override.side)
            if key in leaf_override_lookup:
                raise ValueError("processing.selection.leafOverrides must have unique physical refs")
            leaf_override_lookup[key] = leaf_override

        for page in self.pages:
            key = _physical_ref_key(page.sourcePdfPageNumber, page.leafSide)
            leaf_override = leaf_override_lookup.get(key)
            if leaf_override is not None:
                if page.contentClass != leaf_override.contentClass:
                    raise ValueError("page contentClass must match processing.selection.leafOverride.contentClass")
                if page.rotationDegrees != leaf_override.rotationDegrees:
                    raise ValueError("page rotationDegrees must match processing.selection.leafOverride.rotationDegrees")
            else:
                if page.contentClass != "normal":
                    raise ValueError("page contentClass must be normal when no leafOverride exists")
                if page.rotationDegrees != 0:
                    raise ValueError("page rotationDegrees must be 0 when no leafOverride exists")

        projection = self.model_dump(mode="json", by_alias=True, exclude_none=False)
        projection.pop("sampleHash")
        projection.pop("createdAt")
        recomputed = "sha256:" + hashlib.sha256(canonical_json_bytes(projection)).hexdigest()
        if recomputed != self.sampleHash:
            raise ValueError("sampleHash must equal recomputed outer hash")
        return self


class PreparationReport(_StrictModel):
    schemaVersion: Literal[1]
    documentId: str = Field(min_length=1, max_length=128)
    pdfSha256: str
    pageInventorySha256: str
    processingFingerprint: str
    preparedDocumentHash: str
    publicationGate: PublicationGateSnapshot
    prepareAllowed: bool
    publishAllowed: bool
    blockingReasons: list[str] = Field(default_factory=list, max_length=2000)
    candidatePdfPages: int = Field(ge=0)
    logicalPages: int = Field(ge=0)
    inventoryIncluded: int = Field(ge=0)
    inventoryExcludedDuplicates: int = Field(ge=0)
    inventoryExcludedNonbody: int = Field(ge=0)
    blankPages: list[int] = Field(default_factory=list, max_length=2000)
    ocrPages: int = Field(ge=0)
    lowQualityPages: list[int] = Field(default_factory=list, max_length=2000)
    unassignedBodyLines: int = Field(ge=0)
    unassignedTableLines: int = Field(default=0, ge=0)
    chunks: int = Field(ge=0)
    stageRelativePath: str
    preparedAt: datetime

    @field_validator("pdfSha256", "pageInventorySha256", "processingFingerprint", "preparedDocumentHash")
    @classmethod
    def _validate_hashes(cls, value: str) -> str:
        return _require_sha256(value)

    @field_validator("stageRelativePath")
    @classmethod
    def _validate_path(cls, value: str) -> str:
        return _require_safe_relative_path(value)

    @field_validator("preparedAt")
    @classmethod
    def _validate_prepared_at(cls, value: datetime) -> datetime:
        return _require_aware_datetime(value)

    @field_validator("blockingReasons")
    @classmethod
    def _validate_blocking_reasons(cls, value: list[str]) -> list[str]:
        for item in value:
            _require_nonblank(item)
            if len(item) > 256:
                raise ValueError("blockingReasons entries must be 1..256 characters")
        if value != sorted(set(value)):
            raise ValueError("blockingReasons must be unique and lexically sorted")
        return value

    @field_validator("blankPages", "lowQualityPages")
    @classmethod
    def _validate_page_lists(cls, value: list[int]) -> list[int]:
        for item in value:
            if item < 1 or item > 2000:
                raise ValueError("page numbers must be 1..2000")
        if value != sorted(set(value)):
            raise ValueError("page lists must be unique and sorted")
        return value

    @model_validator(mode="after")
    def _validate_report(self) -> "PreparationReport":
        if self.inventoryIncluded + self.inventoryExcludedDuplicates + self.inventoryExcludedNonbody != self.candidatePdfPages:
            raise ValueError("inventoryIncluded + inventoryExcludedDuplicates + inventoryExcludedNonbody must equal candidatePdfPages")
        if self.prepareAllowed:
            if self.logicalPages != self.inventoryIncluded or self.inventoryIncluded != self.ocrPages:
                raise ValueError("prepareAllowed requires logicalPages == inventoryIncluded == ocrPages")
        if any(page > self.logicalPages for page in self.blankPages):
            raise ValueError("blankPages values must be <= logicalPages")
        if any(page > self.logicalPages for page in self.lowQualityPages):
            raise ValueError("lowQualityPages values must be <= logicalPages")
        if self.publishAllowed:
            if not self.prepareAllowed:
                raise ValueError("publishAllowed requires prepareAllowed")
            if not self.publicationGate.sourceIsExactRecord:
                raise ValueError("publishAllowed requires publicationGate.sourceIsExactRecord")
            if not self.publicationGate.coverage.acceptedForProduct:
                raise ValueError("publishAllowed requires publicationGate.coverage.acceptedForProduct")
            if self.publicationGate.coverage.acceptedAt is None:
                raise ValueError("publishAllowed requires publicationGate.coverage.acceptedAt to be non-null")
        return self
