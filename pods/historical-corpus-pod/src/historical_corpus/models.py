from __future__ import annotations

import re
from typing import Annotated, Any

from pydantic import BaseModel, Field, field_validator

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


class RightsMetadata(BaseModel):
    status: str = Field(min_length=1, max_length=128)
    uri: str = Field(min_length=1, max_length=2048)
    verifiedAt: str = Field(min_length=1, max_length=64)
    isExplicitlyReusable: bool

    @field_validator("verifiedAt")
    @classmethod
    def _validate_verified_at(cls, v: str) -> str:
        try:
            from datetime import datetime
            datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("verifiedAt must be ISO 8601")
        return v


class ChunkInput(BaseModel):
    originalText: str = Field(min_length=1, max_length=65536)
    correctedText: str | None = Field(default=None, max_length=65536)
    pageStart: int = Field(ge=1)
    pageEnd: int = Field(ge=1)
    sectionPath: list[str] = Field(default_factory=list, max_length=32)
    cityQids: list[str] = Field(default_factory=list, max_length=16)
    entityQids: list[str] = Field(default_factory=list, max_length=32)
    historicalPeriod: str = Field(min_length=1, max_length=64)
    ocrConfidence: float = Field(ge=0.0, le=1.0)

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
        return _validate_unique_bounded_list(v, 32, lambda x: None)

    @field_validator("cityQids")
    @classmethod
    def _validate_city_qids(cls, v: list[str]) -> list[str]:
        return _validate_unique_bounded_list(v, 16, _validate_qid)

    @field_validator("entityQids")
    @classmethod
    def _validate_entity_qids(cls, v: list[str]) -> list[str]:
        return _validate_unique_bounded_list(v, 32, _validate_qid)


class IngestRequest(BaseModel):
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
    chunks: list[ChunkInput] = Field(min_length=1, max_length=256)

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


class SearchRequest(BaseModel):
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
        return _validate_unique_bounded_list(v, 16, _validate_iso_language)

    @field_validator("sourceClasses")
    @classmethod
    def _validate_source_classes(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        return _validate_unique_bounded_list(v, 16, lambda x: None)

    @field_validator("rightsStatuses")
    @classmethod
    def _validate_rights_statuses(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        return _validate_unique_bounded_list(v, 16, lambda x: None)

    @field_validator("documentIds")
    @classmethod
    def _validate_document_ids(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        return _validate_unique_bounded_list(v, 64, lambda x: None)

    @field_validator("historicalPeriods")
    @classmethod
    def _validate_historical_periods(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        return _validate_unique_bounded_list(v, 16, lambda x: None)

    @field_validator("minOcrConfidence")
    @classmethod
    def _validate_min_ocr_confidence(cls, v: float | None) -> float | None:
        if v is None:
            return None
        if v < 0.0 or v > 1.0:
            raise ValueError("minOcrConfidence must be in [0, 1]")
        return v


class IngestResult(BaseModel):
    documentId: str
    chunkIds: list[str]


class ChunkRecord(BaseModel):
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
    ocrConfidence: float
    language: str
    sourceClass: str
    rightsStatus: str
    publicationYear: int
    sourceUrl: str
    title: str
    textHash: str
    contentHash: str


class DocumentRecord(BaseModel):
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


class SearchHit(BaseModel):
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


class SearchResponse(BaseModel):
    queryHash: str
    indexVersion: str
    hits: list[SearchHit]


class IndexVersion(BaseModel):
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
