import hashlib
import sqlite3
from pathlib import Path

import pytest

from historical_corpus.backends import DeterministicEmbeddingProvider, DeterministicReranker, InMemoryVectorIndex
from historical_corpus.models import ChunkInput, IngestRequest, RightsMetadata, SearchRequest
from historical_corpus.service import DocumentConflictError, HistoricalCorpusService, RightsNotReusableError


def _make_service(tmp_path: Path) -> HistoricalCorpusService:
    db_path = tmp_path / "corpus.db"
    vector_index = InMemoryVectorIndex()
    embedding_provider = DeterministicEmbeddingProvider()
    reranker = DeterministicReranker()
    return HistoricalCorpusService(
        db_path=db_path,
        vector_index=vector_index,
        embedding_provider=embedding_provider,
        reranker=reranker,
    )


def _chunk(
    original_text: str,
    corrected_text: str,
    page_start: int,
    page_end: int,
    section_path: list[str],
    city_qids: list[str],
    entity_qids: list[str],
    historical_period: str,
    ocr_confidence: float,
) -> ChunkInput:
    return ChunkInput(
        originalText=original_text,
        correctedText=corrected_text,
        pageStart=page_start,
        pageEnd=page_end,
        sectionPath=section_path,
        cityQids=city_qids,
        entityQids=entity_qids,
        historicalPeriod=historical_period,
        ocrConfidence=ocr_confidence,
    )


def test_ingest_rejects_non_reusable_rights(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    rights = RightsMetadata(
        status="all_rights_reserved",
        uri="urn:example:rights:doc-1",
        verifiedAt="2024-01-01T00:00:00Z",
        isExplicitlyReusable=False,
    )
    chunk = _chunk(
        original_text="Texto original no reutilizable",
        corrected_text="Texto corregido no reutilizable",
        page_start=1,
        page_end=1,
        section_path=["capitulo", "1"],
        city_qids=["Q8851"],
        entity_qids=["Q3849447"],
        historical_period="19th_century",
        ocr_confidence=0.95,
    )
    request = IngestRequest(
        documentId="doc-1",
        sourceUrl="https://example.org/doc-1",
        title="Documento no reutilizable",
        author="Autor",
        edition="1",
        publicationYear=1850,
        language="es",
        countryCode="ES",
        sourceClass="archive",
        contentHash="sha256:" + hashlib.sha256(chunk.originalText.encode("utf-8")).hexdigest(),
        rights=rights,
        chunks=[chunk],
    )
    with pytest.raises(RightsNotReusableError):
        service.ingest(request)


def test_ingest_replay_is_idempotent(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    rights = RightsMetadata(
        status="public_domain",
        uri="urn:example:rights:doc-1",
        verifiedAt="2024-01-01T00:00:00Z",
        isExplicitlyReusable=True,
    )
    chunk = _chunk(
        original_text="Texto original reutilizable",
        corrected_text="Texto corregido reutilizable",
        page_start=1,
        page_end=1,
        section_path=["capitulo", "1"],
        city_qids=["Q8851"],
        entity_qids=["Q3849447"],
        historical_period="19th_century",
        ocr_confidence=0.95,
    )
    content_hash = "sha256:" + hashlib.sha256(chunk.originalText.encode("utf-8")).hexdigest()
    request = IngestRequest(
        documentId="doc-1",
        sourceUrl="https://example.org/doc-1",
        title="Documento reutilizable",
        author="Autor",
        edition="1",
        publicationYear=1850,
        language="es",
        countryCode="ES",
        sourceClass="archive",
        contentHash=content_hash,
        rights=rights,
        chunks=[chunk],
    )
    result = service.ingest(request)
    replay = service.ingest(request)
    assert replay.chunkIds == result.chunkIds
    chunk_id = result.chunkIds[0]
    chunk_record = service.get_chunk(chunk_id)
    assert chunk_record.originalText == "Texto original reutilizable"
    assert chunk_record.correctedText == "Texto corregido reutilizable"
    assert chunk_record.pageStart == 1
    assert chunk_record.pageEnd == 1
    assert chunk_record.cityQids == ["Q8851"]
    assert chunk_record.entityQids == ["Q3849447"]
    assert chunk_record.language == "es"
    assert chunk_record.sourceClass == "archive"
    assert chunk_record.rightsStatus == "public_domain"
    assert chunk_record.publicationYear == 1850
    assert chunk_record.historicalPeriod == "19th_century"
    assert chunk_record.ocrConfidence == 0.95


def test_ingest_conflict_same_document_id_different_content(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    rights = RightsMetadata(
        status="public_domain",
        uri="urn:example:rights:doc-1",
        verifiedAt="2024-01-01T00:00:00Z",
        isExplicitlyReusable=True,
    )
    chunk_a = _chunk(
        original_text="Contenido A",
        corrected_text="Contenido A corregido",
        page_start=1,
        page_end=1,
        section_path=["capitulo", "1"],
        city_qids=["Q8851"],
        entity_qids=["Q3849447"],
        historical_period="19th_century",
        ocr_confidence=0.95,
    )
    request_a = IngestRequest(
        documentId="doc-1",
        sourceUrl="https://example.org/doc-1",
        title="Documento A",
        author="Autor",
        edition="1",
        publicationYear=1850,
        language="es",
        countryCode="ES",
        sourceClass="archive",
        contentHash="sha256:" + hashlib.sha256(chunk_a.originalText.encode("utf-8")).hexdigest(),
        rights=rights,
        chunks=[chunk_a],
    )
    service.ingest(request_a)

    chunk_b = _chunk(
        original_text="Contenido B diferente",
        corrected_text="Contenido B corregido",
        page_start=2,
        page_end=2,
        section_path=["capitulo", "2"],
        city_qids=["Q5836"],
        entity_qids=["Q294963"],
        historical_period="19th_century",
        ocr_confidence=0.90,
    )
    request_b = IngestRequest(
        documentId="doc-1",
        sourceUrl="https://example.org/doc-1",
        title="Documento B",
        author="Autor",
        edition="1",
        publicationYear=1860,
        language="es",
        countryCode="ES",
        sourceClass="archive",
        contentHash="sha256:" + hashlib.sha256(chunk_b.originalText.encode("utf-8")).hexdigest(),
        rights=rights,
        chunks=[chunk_b],
    )
    with pytest.raises(DocumentConflictError):
        service.ingest(request_b)


def test_get_chunk_preserves_provenance(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    rights = RightsMetadata(
        status="public_domain",
        uri="urn:example:rights:doc-prov",
        verifiedAt="2024-01-01T00:00:00Z",
        isExplicitlyReusable=True,
    )
    original_text = "Texto original con proveniencia"
    corrected_text = "Texto corregido con proveniencia"
    chunk = _chunk(
        original_text=original_text,
        corrected_text=corrected_text,
        page_start=7,
        page_end=7,
        section_path=["manuscrito", "7"],
        city_qids=["Q5836"],
        entity_qids=["Q294963"],
        historical_period="19th_century",
        ocr_confidence=0.98,
    )
    content_hash = "sha256:" + hashlib.sha256(original_text.encode("utf-8")).hexdigest()
    request = IngestRequest(
        documentId="doc-prov",
        sourceUrl="https://example.org/doc-prov",
        title="Documento con proveniencia",
        author="Autor",
        edition="1",
        publicationYear=1875,
        language="es",
        countryCode="ES",
        sourceClass="manuscript",
        contentHash=content_hash,
        rights=rights,
        chunks=[chunk],
    )
    result = service.ingest(request)
    chunk_id = result.chunkIds[0]
    record = service.get_chunk(chunk_id)
    assert record.originalText == original_text
    assert record.correctedText == corrected_text
    assert record.pageStart == 7
    assert record.pageEnd == 7
    assert record.cityQids == ["Q5836"]
    assert record.entityQids == ["Q294963"]
    assert record.language == "es"
    assert record.sourceClass == "manuscript"
    assert record.rightsStatus == "public_domain"
    assert record.publicationYear == 1875
    assert record.historicalPeriod == "19th_century"
    assert record.ocrConfidence == 0.98
    assert record.sourceUrl == "https://example.org/doc-prov"
    assert record.title == "Documento con proveniencia"
    assert record.textHash == "sha256:" + hashlib.sha256(original_text.encode("utf-8")).hexdigest()
    assert record.contentHash == content_hash
