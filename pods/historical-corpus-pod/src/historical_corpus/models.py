from __future__ import annotations

import math
import re
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_QID_RE = re.compile(r"^Q[1-9][0-9]*$")
_ISO_COUNTRY_RE = re.compile(r"^[A-Z]{2}$")
_ISO_LANGUAGE_RE = re.compile(r"^[a-z]{2,3}$")


def _validate_sha256(value: str) -> str:
    if not _SHA256_RE.match(value):
        raise ValueError("must be sha256:<64 lowercase hex>")
    return value


def _validate_qid(value: str) -> str:
    if not _QID_RE.match(value):
        raise ValueError("must match ^Q[1-9][0-9]*$")
    return value


def _validate_iso_country(value: str) -> str:
    if not _ISO_COUNTRY_RE.match(value):
        raise ValueError("must be ISO 3166-1 alpha-2")
    return value


def _validate_iso_language(value: str) -> str:
    if not _ISO_LANGUAGE_RE.match(value):
        raise ValueError("must be ISO 639-1/2/3 lowercase")
    return value


_PRINTED_LABEL_RE = re.compile(r"^[1-9][0-9]{0,3}$")


def _validate_finite_float(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("must be a finite number")
    return value


def _validate_timezone_aware_datetime(value: str) -> str:
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("must be ISO 8601")
    if dt.tzinfo is None:
        raise ValueError("must be timezone-aware")
    return value


def _validate_printed_label(value: str) -> str:
    if not _PRINTED_LABEL_RE.match(value):
        raise ValueError("must match ^[1-9][0-9]{0,3}$")
    return value


class _StrictBaseModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


def _validate_unique_bounded_list(value: list[str], max_len: int, validator: Any) -> list[str]:
    if len(value) > max_len:
        raise ValueError(f"list length must be <= {max_len}")
    seen: set[str] = set()
    for item in value:
        validator(item)
        if item in seen:
            raise ValueError("list must contain unique values")
        seen.add(item)
    return value


class PrintedRange(_StrictBaseModel):
    start: str
    end: str

    @field_validator("start", "end")
    @classmethod
    def _validate_labels(cls, v: str) -> str:
        return _validate_printed_label(v)

    @model_validator(mode="after")
    def _validate_order(self) -> "PrintedRange":
        if int(self.start) > int(self.end):
            raise ValueError("start must be <= end")
        return self


class NormalizedBox(_StrictBaseModel):
    x0: float
    y0: float
    x1: float
    y1: float

    @field_validator("x0", "y0", "x1", "y1")
    @classmethod
    def _validate_finite(cls, v: float) -> float:
        return _validate_finite_float(v)

    @model_validator(mode="after")
    def _validate_bounds(self) -> "NormalizedBox":
        for name, val in [("x0", self.x0), ("y0", self.y0), ("x1", self.x1), ("y1", self.y1)]:
            if val < 0.0 or val > 1.0:
                raise ValueError(f"{name} must be in [0, 1]")
        if self.x1 <= self.x0:
            raise ValueError("x1 must be > x0")
        if self.y1 <= self.y0:
            raise ValueError("y1 must be > y0")
        return self


class RightsMetadata(_StrictBaseModel):
    status: str = Field(min_length=1, max_length=128)
    uri: str = Field(min_length=1, max_length=2048)
    verifiedAt: str = Field(min_length=1, max_length=64)
    isExplicitlyReusable: bool

    @field_validator("verifiedAt")
    @classmethod
    def _validate_verified_at(cls, v: str) -> str:
        from datetime import datetime
        try:
            dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("verifiedAt must be ISO 8601")
        if dt.tzinfo is None:
            raise ValueError("verifiedAt must be timezone-aware")
        return v


class ChunkInput(_StrictBaseModel):
    originalText: str = Field(min_length=1, max_length=65536)
    correctedText: str | None = Field(default=None, max_length=65536)
    pageStart: int = Field(ge=1)
    pageEnd: int = Field(ge=1)
    sectionPath: list[str] = Field(default_factory=list, max_length=32)
    cityQids: list[str] = Field(default_factory=list, max_length=16)
    entityQids: list[str] = Field(default_factory=list, max_length=32)
    historicalPeriod: str = Field(min_length=1, max_length=64)
    ocrConfidence: float = Field(ge=0.0, le=1.0)
    entryTitle: str | None = Field(default=None, min_length=2, max_length=100)

    @field_validator("pageEnd")
    @classmethod
    def _validate_page_end(cls, v: int, info: Any) -> int:
        page_start = info.data.get("pageStart", 1)
        if v < page_start:
            raise ValueError("pageEnd must be >= pageStart")
        return v

    @field_validator("sectionPath")
    @classmethod
    def _validate_section_path(cls, v: list[str]) -> list[str]:
        if len(v) > 32:
            raise ValueError("sectionPath length must be <= 32")
        for item in v:
            if len(item) < 1 or len(item) > 256:
                raise ValueError("sectionPath items must be 1-256 characters")
        return v

    @field_validator("cityQids")
    @classmethod
    def _validate_city_qids(cls, v: list[str]) -> list[str]:
        return _validate_unique_bounded_list(v, 16, _validate_qid)

    @field_validator("entityQids")
    @classmethod
    def _validate_entity_qids(cls, v: list[str]) -> list[str]:
        return _validate_unique_bounded_list(v, 32, _validate_qid)


class DocumentMetadata(_StrictBaseModel):
    documentId: str = Field(min_length=1, max_length=256)
    sourceUrl: str = Field(min_length=1, max_length=2048)
    title: str = Field(min_length=1, max_length=1024)
    author: str = Field(min_length=1, max_length=512)
    edition: str = Field(min_length=1, max_length=128)
    publicationYear: int = Field(ge=1, le=9999)
    language: str
    countryCode: str
    sourceClass: str = Field(min_length=1, max_length=64)
    contentHash: str
    rights: RightsMetadata
    workId: str | None = Field(default=None, min_length=1, max_length=128)
    volumeNumber: int | None = Field(default=None, ge=1, le=1000)
    repositoryName: str | None = Field(default=None, min_length=1, max_length=512)
    historicalPeriod: str | None = Field(default=None, min_length=1, max_length=64)
    temporalScope: str | None = Field(default=None, min_length=1, max_length=512)
    attribution: str | None = Field(default=None, min_length=1, max_length=2048)
    sourceIsExactRecord: bool | None = None
    canonicalPdfSha256: str | None = None
    processingFingerprint: str | None = None
    pageInventorySha256: str | None = None
    coverageStatus: Literal["unknown", "partial_source", "complete_source"] | None = None
    coverageStatement: str | None = Field(default=None, max_length=2048)
    coverageAcceptedForProduct: bool | None = None
    coverageAcceptedAt: str | None = None
    observedPrintedRanges: list[PrintedRange] = Field(default_factory=list, max_length=2000)
    missingPrintedPages: list[str] = Field(default_factory=list, max_length=2000)

    @field_validator("sourceUrl")
    @classmethod
    def _validate_source_url(cls, v: str) -> str:
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("sourceUrl must start with http:// or https://")
        return v

    @field_validator("contentHash")
    @classmethod
    def _validate_content_hash(cls, v: str) -> str:
        return _validate_sha256(v)

    @field_validator("language")
    @classmethod
    def _validate_language(cls, v: str) -> str:
        return _validate_iso_language(v)

    @field_validator("countryCode")
    @classmethod
    def _validate_country_code(cls, v: str) -> str:
        return _validate_iso_country(v)

    @field_validator("canonicalPdfSha256", "processingFingerprint", "pageInventorySha256")
    @classmethod
    def _validate_sha256_fields(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_sha256(v)

    @field_validator("coverageAcceptedAt")
    @classmethod
    def _validate_coverage_accepted_at(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_timezone_aware_datetime(v)

    @model_validator(mode="after")
    def _validate_coverage(self) -> "DocumentMetadata":
        has_coverage = (
            self.coverageStatus is not None
            or self.coverageStatement is not None
            or self.coverageAcceptedForProduct is not None
            or self.coverageAcceptedAt is not None
            or self.observedPrintedRanges
            or self.missingPrintedPages
        )
        if not has_coverage:
            return self

        if self.coverageStatus is None:
            raise ValueError("coverageStatus is required when coverage metadata is present")
        if self.coverageAcceptedForProduct is None:
            raise ValueError("coverageAcceptedForProduct is required when coverage metadata is present")

        if self.coverageStatus == "partial_source":
            if not self.coverageStatement or not self.coverageStatement.strip():
                raise ValueError("coverageStatement must be non-blank for partial_source")
            if not self.missingPrintedPages:
                raise ValueError("missingPrintedPages must be non-empty for partial_source")
        elif self.coverageStatus == "complete_source":
            if self.missingPrintedPages:
                raise ValueError("missingPrintedPages must be empty for complete_source")
        elif self.coverageStatus == "unknown":
            if self.coverageAcceptedForProduct:
                raise ValueError("coverageAcceptedForProduct must be false for unknown")

        if self.coverageAcceptedForProduct:
            if self.coverageAcceptedAt is None:
                raise ValueError("coverageAcceptedAt is required when coverageAcceptedForProduct is true")
        else:
            if self.coverageAcceptedAt is not None:
                raise ValueError("coverageAcceptedAt must be null when coverageAcceptedForProduct is false")

        if self.observedPrintedRanges:
            prev_end: int | None = None
            for r in self.observedPrintedRanges:
                s, e = int(r.start), int(r.end)
                if prev_end is not None and s <= prev_end:
                    raise ValueError("observedPrintedRanges must be ordered and non-overlapping")
                prev_end = e

        if self.missingPrintedPages:
            seen: set[str] = set()
            prev: int | None = None
            for label in self.missingPrintedPages:
                _validate_printed_label(label)
                if label in seen:
                    raise ValueError("missingPrintedPages must contain unique values")
                seen.add(label)
                n = int(label)
                if prev is not None and n <= prev:
                    raise ValueError("missingPrintedPages must be ordered")
                prev = n
                for r in self.observedPrintedRanges:
                    if int(r.start) <= n <= int(r.end):
                        raise ValueError("missingPrintedPages must be outside observedPrintedRanges")

        return self


class IngestRequest(DocumentMetadata):
    chunks: list[ChunkInput] = Field(min_length=1, max_length=256)

    @model_validator(mode="before")
    @classmethod
    def _validate_prepared_only_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        defaults: dict[str, Any] = {
            "sourceIsExactRecord": None,
            "canonicalPdfSha256": None,
            "processingFingerprint": None,
            "pageInventorySha256": None,
            "coverageStatus": None,
            "coverageStatement": None,
            "observedPrintedRanges": [],
            "missingPrintedPages": [],
            "coverageAcceptedForProduct": None,
            "coverageAcceptedAt": None,
        }
        for name, default in defaults.items():
            if name in value and value[name] != default:
                raise ValueError(f"{name} is prepared-only and cannot be set in IngestRequest")
        return value


class SearchRequest(_StrictBaseModel):
    query: str = Field(min_length=1, max_length=2048)
    cityQid: str | None = None
    stopQid: str | None = None
    languages: list[str] | None = None
    sourceClasses: list[str] | None = None
    rightsStatuses: list[str] | None = None
    documentIds: list[str] | None = None
    publicationYearFrom: int | None = None
    publicationYearTo: int | None = None
    historicalPeriods: list[str] | None = None
    minOcrConfidence: float | None = None
    limit: int = Field(default=10, ge=1, le=50)

    @model_validator(mode="after")
    def _validate_publication_year_range(self) -> "SearchRequest":
        if self.publicationYearFrom is not None and self.publicationYearTo is not None:
            if self.publicationYearFrom > self.publicationYearTo:
                raise ValueError("publicationYearFrom must be <= publicationYearTo")
        return self

    @field_validator("cityQid")
    @classmethod
    def _validate_city_qid(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_qid(v)

    @field_validator("stopQid")
    @classmethod
    def _validate_stop_qid(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_qid(v)

    @field_validator("languages")
    @classmethod
    def _validate_languages(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        if len(v) == 0:
            raise ValueError("languages must be non-empty when supplied")
        return _validate_unique_bounded_list(v, 16, _validate_iso_language)

    @field_validator("sourceClasses")
    @classmethod
    def _validate_source_classes(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        if len(v) == 0:
            raise ValueError("sourceClasses must be non-empty when supplied")
        return _validate_unique_bounded_list(v, 16, lambda x: None)

    @field_validator("rightsStatuses")
    @classmethod
    def _validate_rights_statuses(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        if len(v) == 0:
            raise ValueError("rightsStatuses must be non-empty when supplied")
        return _validate_unique_bounded_list(v, 16, lambda x: None)

    @field_validator("documentIds")
    @classmethod
    def _validate_document_ids(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        if len(v) == 0:
            raise ValueError("documentIds must be non-empty when supplied")
        return _validate_unique_bounded_list(v, 64, lambda x: None)

    @field_validator("historicalPeriods")
    @classmethod
    def _validate_historical_periods(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        if len(v) == 0:
            raise ValueError("historicalPeriods must be non-empty when supplied")
        return _validate_unique_bounded_list(v, 16, lambda x: None)

    @field_validator("minOcrConfidence")
    @classmethod
    def _validate_min_ocr_confidence(cls, v: float | None) -> float | None:
        if v is None:
            return None
        if not math.isfinite(v) or v < 0.0 or v > 1.0:
            raise ValueError("minOcrConfidence must be in [0, 1]")
        return v


class StopSearchRequest(SearchRequest):
    cityQid: str
    stopQid: str
    labels: list[str] = Field(min_length=1, max_length=16)
    missingRoles: list[str] = Field(min_length=1, max_length=16)

    @field_validator("cityQid")
    @classmethod
    def _validate_city_qid(cls, v: str) -> str:
        return _validate_qid(v)

    @field_validator("stopQid")
    @classmethod
    def _validate_stop_qid(cls, v: str) -> str:
        return _validate_qid(v)

    @field_validator("labels")
    @classmethod
    def _validate_labels(cls, v: list[str]) -> list[str]:
        for item in v:
            if not (1 <= len(item) <= 256):
                raise ValueError("labels items must be 1-256 characters")
        return _validate_unique_bounded_list(v, 16, lambda _: None)

    @field_validator("missingRoles")
    @classmethod
    def _validate_missing_roles(cls, v: list[str]) -> list[str]:
        for item in v:
            if not (1 <= len(item) <= 128):
                raise ValueError("missingRoles items must be 1-128 characters")
        return _validate_unique_bounded_list(v, 16, lambda _: None)

    @model_validator(mode="after")
    def _validate_composed_query_length(self) -> "StopSearchRequest":
        composed = f"{self.query}\nAliases: {' | '.join(self.labels)}\nMissing evidence roles: {', '.join(self.missingRoles)}"
        if len(composed) > 2048:
            raise ValueError("composed query must be <= 2048 characters")
        return self

    def to_search_request(self) -> SearchRequest:
        data = self.model_dump()
        data.pop("labels", None)
        data.pop("missingRoles", None)
        data["query"] = f"{self.query}\nAliases: {' | '.join(self.labels)}\nMissing evidence roles: {', '.join(self.missingRoles)}"
        return SearchRequest.model_validate(data)


class ClaimSearchRequest(SearchRequest):
    cityQid: str
    stopQid: str
    claim: str = Field(min_length=1, max_length=4096)

    @field_validator("cityQid")
    @classmethod
    def _validate_city_qid(cls, v: str) -> str:
        return _validate_qid(v)

    @field_validator("stopQid")
    @classmethod
    def _validate_stop_qid(cls, v: str) -> str:
        return _validate_qid(v)

    @model_validator(mode="after")
    def _validate_composed_query_length(self) -> "ClaimSearchRequest":
        composed = f"{self.query}\nClaim to verify: {self.claim}"
        if len(composed) > 2048:
            raise ValueError("composed query must be <= 2048 characters")
        return self

    def to_search_request(self) -> SearchRequest:
        data = self.model_dump()
        data.pop("claim", None)
        data["query"] = f"{self.query}\nClaim to verify: {self.claim}"
        return SearchRequest.model_validate(data)


class SourceLineRecord(_StrictBaseModel):
    lineId: str
    lineOrder: int = Field(ge=0)
    originalText: str = Field(min_length=1, max_length=4096)
    confidence: float = Field(ge=0.0, le=1.0)
    box: NormalizedBox
    orientationDegrees: Literal[0, 90, 180, 270] | None = None
    role: Literal["body", "header", "footer", "table", "unknown"]

    @field_validator("lineId")
    @classmethod
    def _validate_line_id(cls, v: str) -> str:
        return _validate_sha256(v)

    @field_validator("confidence")
    @classmethod
    def _validate_confidence(cls, v: float) -> float:
        return _validate_finite_float(v)


class PageSummary(_StrictBaseModel):
    pageId: str
    documentId: str = Field(min_length=1, max_length=128)
    logicalPageNumber: int = Field(ge=1)
    sourcePdfPageNumber: int = Field(ge=1)
    leafSide: Literal["left", "right", "full"]
    continuityBreakBefore: bool
    printedPageLabel: str | None
    contentClass: Literal["normal", "table", "mixed_orientation"]
    textSource: Literal["ppocrv6"]
    qualityScore: float = Field(ge=0.0, le=1.0)
    qualityFlags: list[str] = Field(default_factory=list, max_length=8)
    workId: str = Field(min_length=1, max_length=128)
    volumeNumber: int = Field(ge=1, le=1000)
    repositoryName: str = Field(min_length=1, max_length=512)
    historicalPeriod: str = Field(min_length=1, max_length=64)
    temporalScope: str = Field(min_length=1, max_length=512)
    attribution: str = Field(min_length=1, max_length=2048)
    sourceIsExactRecord: bool
    canonicalPdfSha256: str
    processingFingerprint: str
    pageInventorySha256: str
    inventoryVerifiedAt: str
    sourceUrl: str = Field(min_length=1, max_length=2048)
    rightsStatus: str = Field(min_length=1, max_length=128)
    rightsUri: str = Field(min_length=1, max_length=2048)
    rightsVerifiedAt: str = Field(min_length=1, max_length=64)
    rightsIsExplicitlyReusable: bool
    coverageStatus: Literal["unknown", "partial_source", "complete_source"]
    coverageStatement: str | None = Field(default=None, max_length=2048)
    observedPrintedRanges: list[PrintedRange] = Field(default_factory=list, max_length=2000)
    missingPrintedPages: list[str] = Field(default_factory=list, max_length=2000)
    coverageAcceptedForProduct: bool
    coverageAcceptedAt: str | None = None

    @field_validator("pageId")
    @classmethod
    def _validate_page_id(cls, v: str) -> str:
        return _validate_sha256(v)

    @field_validator("printedPageLabel")
    @classmethod
    def _validate_printed_page_label(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_printed_label(v)

    @field_validator("qualityScore")
    @classmethod
    def _validate_quality_score(cls, v: float) -> float:
        return _validate_finite_float(v)

    @field_validator("qualityFlags")
    @classmethod
    def _validate_quality_flags(cls, v: list[str]) -> list[str]:
        allowed = {"blank", "low_confidence", "mixed_orientation", "table_heavy", "rotation_applied", "oversize_body_line"}
        if len(v) > 8:
            raise ValueError("qualityFlags must have at most 8 values")
        seen: set[str] = set()
        for item in v:
            if item not in allowed:
                raise ValueError(f"qualityFlags item must be one of {sorted(allowed)}")
            if item in seen:
                raise ValueError("qualityFlags must contain unique values")
            seen.add(item)
        if v != sorted(v):
            raise ValueError("qualityFlags must be sorted")
        return v

    @field_validator("canonicalPdfSha256", "processingFingerprint", "pageInventorySha256")
    @classmethod
    def _validate_sha256_fields(cls, v: str) -> str:
        return _validate_sha256(v)

    @field_validator("inventoryVerifiedAt")
    @classmethod
    def _validate_inventory_verified_at(cls, v: str) -> str:
        return _validate_timezone_aware_datetime(v)

    @field_validator("rightsVerifiedAt")
    @classmethod
    def _validate_rights_verified_at(cls, v: str) -> str:
        return _validate_timezone_aware_datetime(v)

    @field_validator("sourceUrl")
    @classmethod
    def _validate_source_url(cls, v: str) -> str:
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("sourceUrl must start with http:// or https://")
        return v

    @field_validator("coverageAcceptedAt")
    @classmethod
    def _validate_coverage_accepted_at(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_timezone_aware_datetime(v)

    @model_validator(mode="after")
    def _validate_coverage(self) -> "PageSummary":
        if self.coverageStatus == "partial_source":
            if not self.coverageStatement or not self.coverageStatement.strip():
                raise ValueError("coverageStatement must be non-blank for partial_source")
            if not self.missingPrintedPages:
                raise ValueError("missingPrintedPages must be non-empty for partial_source")
        elif self.coverageStatus == "complete_source":
            if self.missingPrintedPages:
                raise ValueError("missingPrintedPages must be empty for complete_source")
        elif self.coverageStatus == "unknown":
            if self.coverageAcceptedForProduct:
                raise ValueError("coverageAcceptedForProduct must be false for unknown")

        if self.coverageAcceptedForProduct:
            if self.coverageAcceptedAt is None:
                raise ValueError("coverageAcceptedAt is required when coverageAcceptedForProduct is true")
        else:
            if self.coverageAcceptedAt is not None:
                raise ValueError("coverageAcceptedAt must be null when coverageAcceptedForProduct is false")

        if self.observedPrintedRanges:
            prev_end: int | None = None
            for r in self.observedPrintedRanges:
                s, e = int(r.start), int(r.end)
                if prev_end is not None and s <= prev_end:
                    raise ValueError("observedPrintedRanges must be ordered and non-overlapping")
                prev_end = e

        if self.missingPrintedPages:
            seen: set[str] = set()
            prev: int | None = None
            for label in self.missingPrintedPages:
                _validate_printed_label(label)
                if label in seen:
                    raise ValueError("missingPrintedPages must contain unique values")
                seen.add(label)
                n = int(label)
                if prev is not None and n <= prev:
                    raise ValueError("missingPrintedPages must be ordered")
                prev = n
                for r in self.observedPrintedRanges:
                    if int(r.start) <= n <= int(r.end):
                        raise ValueError("missingPrintedPages must be outside observedPrintedRanges")

        return self


class PageRecord(PageSummary):
    cropBox: NormalizedBox
    widthPx: int = Field(ge=1)
    heightPx: int = Field(ge=1)
    renderDpi: int = Field(ge=1)
    rasterizationPolicy: str = Field(min_length=1, max_length=128)
    rotationDegrees: Literal[0, 90, 180, 270]
    imageSha256: str
    foregroundRatio: float = Field(ge=0.0, le=1.0)
    meanConfidence: float = Field(ge=0.0, le=1.0)
    lowConfidenceRatio: float = Field(ge=0.0, le=1.0)
    ocrEngine: Literal["transformers"]
    ocrEngineVersion: str = Field(min_length=1, max_length=64)
    ocrDetectionModel: str = Field(min_length=1, max_length=128)
    ocrRecognitionModel: str = Field(min_length=1, max_length=128)
    originalText: str = Field(max_length=2048499)
    lines: list[SourceLineRecord] = Field(max_length=500)

    @field_validator("imageSha256")
    @classmethod
    def _validate_image_sha256(cls, v: str) -> str:
        return _validate_sha256(v)

    @field_validator("foregroundRatio", "meanConfidence", "lowConfidenceRatio")
    @classmethod
    def _validate_finite_ratios(cls, v: float) -> float:
        return _validate_finite_float(v)

    @model_validator(mode="after")
    def _validate_lines(self) -> "PageRecord":
        prev_order: int | None = None
        for line in self.lines:
            if prev_order is not None and line.lineOrder <= prev_order:
                raise ValueError("lines must have strictly increasing lineOrder values")
            prev_order = line.lineOrder
        return self


class IngestResult(_StrictBaseModel):
    documentId: str
    chunkIds: list[str]


class ChunkRecord(_StrictBaseModel):
    chunkId: str
    documentId: str
    originalText: str
    correctedText: str | None
    pageStart: int
    pageEnd: int
    sectionPath: list[str]
    cityQids: list[str]
    entityQids: list[str]
    historicalPeriod: str
    ocrConfidence: float = Field(ge=0.0, le=1.0)
    language: str
    sourceClass: str
    rightsStatus: str
    publicationYear: int
    sourceUrl: str
    title: str
    textHash: str
    contentHash: str
    rightsUri: str
    rightsVerifiedAt: str
    entryTitle: str | None = Field(default=None, min_length=2, max_length=100)
    lineIds: list[str] = Field(default_factory=list, max_length=512)
    rightsIsExplicitlyReusable: bool = True
    workId: str | None = Field(default=None, min_length=1, max_length=128)
    volumeNumber: int | None = Field(default=None, ge=1, le=1000)
    repositoryName: str | None = Field(default=None, min_length=1, max_length=512)
    temporalScope: str | None = Field(default=None, min_length=1, max_length=512)
    attribution: str | None = Field(default=None, min_length=1, max_length=2048)
    sourceIsExactRecord: bool | None = None
    canonicalPdfSha256: str | None = None
    processingFingerprint: str | None = None
    pageInventorySha256: str | None = None
    inventoryVerifiedAt: str | None = None
    coverageStatus: Literal["unknown", "partial_source", "complete_source"] | None = None
    coverageStatement: str | None = Field(default=None, max_length=2048)
    coverageAcceptedForProduct: bool | None = None
    coverageAcceptedAt: str | None = None
    observedPrintedRanges: list[PrintedRange] = Field(default_factory=list, max_length=2000)
    missingPrintedPages: list[str] = Field(default_factory=list, max_length=2000)

    @field_validator("chunkId", "textHash", "contentHash")
    @classmethod
    def _validate_sha256_fields(cls, v: str) -> str:
        return _validate_sha256(v)

    @field_validator("canonicalPdfSha256", "processingFingerprint", "pageInventorySha256")
    @classmethod
    def _validate_optional_sha256_fields(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_sha256(v)

    @field_validator("inventoryVerifiedAt", "coverageAcceptedAt")
    @classmethod
    def _validate_timezone_aware_fields(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_timezone_aware_datetime(v)

    @field_validator("ocrConfidence")
    @classmethod
    def _validate_ocr_confidence(cls, v: float) -> float:
        return _validate_finite_float(v)

    @field_validator("lineIds")
    @classmethod
    def _validate_line_ids(cls, v: list[str]) -> list[str]:
        return _validate_unique_bounded_list(v, 512, _validate_sha256)

    @field_validator("missingPrintedPages")
    @classmethod
    def _validate_missing_printed_pages(cls, v: list[str]) -> list[str]:
        return _validate_unique_bounded_list(v, 2000, _validate_printed_label)


class DocumentRecord(_StrictBaseModel):
    documentId: str
    sourceUrl: str
    title: str
    author: str
    edition: str
    publicationYear: int
    language: str
    countryCode: str
    sourceClass: str
    contentHash: str
    rightsStatus: str
    rightsUri: str
    rightsVerifiedAt: str
    rightsIsExplicitlyReusable: bool
    workId: str | None = Field(default=None, min_length=1, max_length=128)
    volumeNumber: int | None = Field(default=None, ge=1, le=1000)
    repositoryName: str | None = Field(default=None, min_length=1, max_length=512)
    historicalPeriod: str | None = Field(default=None, min_length=1, max_length=64)
    temporalScope: str | None = Field(default=None, min_length=1, max_length=512)
    attribution: str | None = Field(default=None, min_length=1, max_length=2048)
    sourceIsExactRecord: bool | None = None
    canonicalPdfSha256: str | None = None
    processingFingerprint: str | None = None
    pageInventorySha256: str | None = None
    inventoryVerifiedAt: str | None = None
    coverageStatus: Literal["unknown", "partial_source", "complete_source"] | None = None
    coverageStatement: str | None = Field(default=None, max_length=2048)
    coverageAcceptedForProduct: bool | None = None
    coverageAcceptedAt: str | None = None
    observedPrintedRanges: list[PrintedRange] = Field(default_factory=list, max_length=2000)
    missingPrintedPages: list[str] = Field(default_factory=list, max_length=2000)

    @field_validator("sourceUrl")
    @classmethod
    def _validate_source_url(cls, v: str) -> str:
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("sourceUrl must start with http:// or https://")
        return v

    @field_validator("contentHash")
    @classmethod
    def _validate_content_hash(cls, v: str) -> str:
        return _validate_sha256(v)

    @field_validator("language")
    @classmethod
    def _validate_language(cls, v: str) -> str:
        return _validate_iso_language(v)

    @field_validator("countryCode")
    @classmethod
    def _validate_country_code(cls, v: str) -> str:
        return _validate_iso_country(v)

    @field_validator("canonicalPdfSha256", "processingFingerprint", "pageInventorySha256")
    @classmethod
    def _validate_sha256_fields(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_sha256(v)

    @field_validator("inventoryVerifiedAt", "coverageAcceptedAt")
    @classmethod
    def _validate_timezone_aware_fields(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_timezone_aware_datetime(v)

    @field_validator("missingPrintedPages")
    @classmethod
    def _validate_missing_printed_pages(cls, v: list[str]) -> list[str]:
        return _validate_unique_bounded_list(v, 2000, _validate_printed_label)


class SearchHit(_StrictBaseModel):
    chunkId: str
    documentId: str
    pageStart: int
    pageEnd: int
    textHash: str
    contentHash: str
    sourceUrl: str
    title: str
    rightsStatus: str
    lexicalScore: float
    denseScore: float
    fusionScore: float
    rerankScore: float
    matchedEntityQids: list[str]
    text: str
    sectionPath: list[str]
    cityQids: list[str]
    entityQids: list[str]
    language: str
    sourceClass: str
    publicationYear: int
    historicalPeriod: str
    ocrConfidence: float = Field(ge=0.0, le=1.0)
    rightsUri: str
    rightsVerifiedAt: str
    entryTitle: str | None = Field(default=None, min_length=2, max_length=100)
    lineIds: list[str] = Field(default_factory=list, max_length=512)
    rightsIsExplicitlyReusable: bool = True
    workId: str | None = Field(default=None, min_length=1, max_length=128)
    volumeNumber: int | None = Field(default=None, ge=1, le=1000)
    repositoryName: str | None = Field(default=None, min_length=1, max_length=512)
    temporalScope: str | None = Field(default=None, min_length=1, max_length=512)
    attribution: str | None = Field(default=None, min_length=1, max_length=2048)
    sourceIsExactRecord: bool | None = None
    canonicalPdfSha256: str | None = None
    processingFingerprint: str | None = None
    pageInventorySha256: str | None = None
    inventoryVerifiedAt: str | None = None
    coverageStatus: Literal["unknown", "partial_source", "complete_source"] | None = None
    coverageStatement: str | None = Field(default=None, max_length=2048)
    coverageAcceptedForProduct: bool | None = None
    coverageAcceptedAt: str | None = None
    observedPrintedRanges: list[PrintedRange] = Field(default_factory=list, max_length=2000)
    missingPrintedPages: list[str] = Field(default_factory=list, max_length=2000)

    @field_validator("chunkId", "textHash", "contentHash")
    @classmethod
    def _validate_sha256_fields(cls, v: str) -> str:
        return _validate_sha256(v)

    @field_validator("canonicalPdfSha256", "processingFingerprint", "pageInventorySha256")
    @classmethod
    def _validate_optional_sha256_fields(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_sha256(v)

    @field_validator("inventoryVerifiedAt", "coverageAcceptedAt")
    @classmethod
    def _validate_timezone_aware_fields(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_timezone_aware_datetime(v)

    @field_validator("ocrConfidence")
    @classmethod
    def _validate_ocr_confidence(cls, v: float) -> float:
        return _validate_finite_float(v)

    @field_validator("lexicalScore", "denseScore", "fusionScore", "rerankScore")
    @classmethod
    def _validate_finite_scores(cls, v: float) -> float:
        return _validate_finite_float(v)

    @field_validator("lineIds")
    @classmethod
    def _validate_line_ids(cls, v: list[str]) -> list[str]:
        return _validate_unique_bounded_list(v, 512, _validate_sha256)

    @field_validator("missingPrintedPages")
    @classmethod
    def _validate_missing_printed_pages(cls, v: list[str]) -> list[str]:
        return _validate_unique_bounded_list(v, 2000, _validate_printed_label)


class SearchResponse(_StrictBaseModel):
    queryHash: str
    indexVersion: str
    hits: list[SearchHit]


class IndexVersion(_StrictBaseModel):
    generation: int
    indexVersion: str
    corpusIndexVersion: str
    embeddingModel: str
    embeddingDimension: int
    rerankerModel: str
    chunkingPolicyVersion: str
    sourceRegistryVersion: str
    documentCount: int
    chunkCount: int
