from __future__ import annotations

import math
from datetime import datetime
from pathlib import PurePosixPath
import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from historical_corpus.models import NormalizedBox, PrintedRange


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


def _page_ref_key(ref: "InventoryPageRef") -> tuple[int, int]:
    return (ref.pdfPage, _SIDE_ORDER[ref.side])


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
    lineOrder: int = Field(ge=0, le=499)
    originalText: str = Field(min_length=1, max_length=4096)
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
    "low_confidence",
    "mixed_orientation",
    "table_heavy",
    "rotation_applied",
    "oversize_body_line",
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
    textSource: Literal["ppocrv6"]
    ocrEngine: Literal["transformers"]
    ocrEngineVersion: str = Field(min_length=1, max_length=64)
    ocrDetectionModel: str = Field(min_length=1, max_length=128)
    ocrRecognitionModel: str = Field(min_length=1, max_length=128)
    meanConfidence: float = Field(ge=0.0, le=1.0)
    lowConfidenceRatio: float = Field(ge=0.0, le=1.0)
    qualityScore: float = Field(ge=0.0, le=1.0)
    qualityFlags: list[QualityFlag] = Field(default_factory=list, max_length=8)
    originalText: str = Field(max_length=2048499)
    lines: list[SourceLineInput] = Field(default_factory=list, max_length=500)

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
        return self


class PrintedLabelCandidate(_StrictModel):
    text: str = Field(min_length=1, max_length=16)
    box: NormalizedBox


class InventoryPageRef(_StrictModel):
    pdfPage: int = Field(ge=1, le=1000)
    side: Literal["left", "right", "full"]


DuplicateReason = Literal[
    "same_label", "same_embedded_text_sha", "simhash_le_3", "dhash_le_5"
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
        candidate_keys = [(item.pdfPage, _SIDE_ORDER[item.side]) for item in self.duplicateCandidates]
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
        if self.normalizedPrintedLabel is None and self.canonicalStatus is None:
            raise ValueError("override requires a label or canonical status")
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
        override_keys = [(item.pdfPage, _SIDE_ORDER[item.side]) for item in self.pageOverrides]
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
