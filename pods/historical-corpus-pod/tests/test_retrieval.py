import hashlib
from pathlib import Path

import pytest

from historical_corpus.backends import DeterministicEmbeddingProvider, DeterministicReranker, InMemoryVectorIndex
from historical_corpus.models import ChunkInput, IngestRequest, RightsMetadata, SearchRequest
from historical_corpus.service import HistoricalCorpusService


class FailOnceVectorIndex(InMemoryVectorIndex):
    def __init__(self, dimension: int = 1024) -> None:
        super().__init__(dimension=dimension)
        self._failed = False

    def upsert(self, ids, vectors) -> None:
        if not self._failed and len(ids) > 0:
            self._failed = True
            raise RuntimeError("simulated vector index failure")
        super().upsert(ids, vectors)


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


def _ingest_three_chunks(service: HistoricalCorpusService) -> None:
    rights = RightsMetadata(
        status="public_domain",
        uri="urn:example:rights:shared",
        verifiedAt="2024-01-01T00:00:00Z",
        isExplicitlyReusable=True,
    )
    documents = [
        {
            "documentId": "doc-malaga-1",
            "sourceUrl": "https://example.org/doc-malaga-1",
            "title": "Documento Malaga 1",
            "author": "Autor",
            "edition": "1",
            "publicationYear": 1850,
            "language": "es",
            "countryCode": "ES",
            "sourceClass": "archive",
            "chunk": _chunk(
                original_text="La historia atribuye a Pío IX una dotación de 15 000 reales en 1850.",
                corrected_text="La historia atribuye a Pío IX una dotación de 15 000 reales en 1850.",
                page_start=1,
                page_end=1,
                section_path=["capitulo", "1"],
                city_qids=["Q8851"],
                entity_qids=["Q3849447"],
                historical_period="19th_century",
                ocr_confidence=0.95,
            ),
        },
        {
            "documentId": "doc-toledo-1",
            "sourceUrl": "https://example.org/doc-toledo-1",
            "title": "Documento Toledo 1",
            "author": "Autor",
            "edition": "1",
            "publicationYear": 1860,
            "language": "es",
            "countryCode": "ES",
            "sourceClass": "manuscript",
            "chunk": _chunk(
                original_text="La historia de Toledo registra la construcción del puente número 7 en 1860.",
                corrected_text="La historia de Toledo registra la construcción del puente número 7 en 1860.",
                page_start=2,
                page_end=2,
                section_path=["capitulo", "2"],
                city_qids=["Q5836"],
                entity_qids=["Q294963"],
                historical_period="19th_century",
                ocr_confidence=0.92,
            ),
        },
        {
            "documentId": "doc-malaga-2",
            "sourceUrl": "https://example.org/doc-malaga-2",
            "title": "Documento Malaga 2",
            "author": "Autor",
            "edition": "1",
            "publicationYear": 1855,
            "language": "es",
            "countryCode": "ES",
            "sourceClass": "archive",
            "chunk": _chunk(
                original_text="La historia del mercado de Malaga registró 1200 unidades en 1855.",
                corrected_text="La historia del mercado de Málaga registró 1200 unidades en 1855.",
                page_start=3,
                page_end=3,
                section_path=["capitulo", "3"],
                city_qids=["Q8851"],
                entity_qids=["Q3849447"],
                historical_period="19th_century",
                ocr_confidence=0.88,
            ),
        },
    ]
    for doc in documents:
        chunk = doc["chunk"]
        request = IngestRequest(
            documentId=doc["documentId"],
            sourceUrl=doc["sourceUrl"],
            title=doc["title"],
            author=doc["author"],
            edition=doc["edition"],
            publicationYear=doc["publicationYear"],
            language=doc["language"],
            countryCode=doc["countryCode"],
            sourceClass=doc["sourceClass"],
            contentHash="sha256:" + hashlib.sha256(chunk.originalText.encode("utf-8")).hexdigest(),
            rights=rights,
            chunks=[chunk],
        )
        service.ingest(request)


def test_spanish_fts_candidate_recall_regression(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    try:
        rights = RightsMetadata(
            status="public_domain",
            uri="urn:example:rights:shared",
            verifiedAt="2024-01-01T00:00:00Z",
            isExplicitlyReusable=True,
        )
        chunk = _chunk(
            original_text="El teatro romano de Málaga fue construido en época altoimperial y reutilizado en siglos posteriores.",
            corrected_text="El teatro romano de Málaga fue construido en época altoimperial y reutilizado en siglos posteriores.",
            page_start=1,
            page_end=1,
            section_path=["capitulo", "1"],
            city_qids=["Q8851"],
            entity_qids=["Q3849447"],
            historical_period="roman_to_late_antiquity",
            ocr_confidence=1.0,
        )
        request = IngestRequest(
            documentId="doc-malaga-theatre",
            sourceUrl="https://example.org/doc-malaga-theatre",
            title="Documento Malaga Teatro",
            author="Autor",
            edition="1",
            publicationYear=2026,
            language="es",
            countryCode="ES",
            sourceClass="archive",
            contentHash="sha256:" + hashlib.sha256(chunk.originalText.encode("utf-8")).hexdigest(),
            rights=rights,
            chunks=[chunk],
        )
        service.ingest(request)
        search_request = SearchRequest(
            query="reutilización del teatro romano en siglos posteriores",
            cityQid="Q8851",
            stopQid=None,
            languages=["es"],
            sourceClasses=["archive"],
            rightsStatuses=["public_domain"],
            documentIds=None,
            publicationYearFrom=None,
            publicationYearTo=None,
            historicalPeriods=None,
            minOcrConfidence=None,
            limit=10,
        )
        response = service.search(search_request)
        assert len(response.hits) == 1
        hit = response.hits[0]
        assert hit.documentId == "doc-malaga-theatre"
        assert hit.lexicalScore is not None
        assert hit.lexicalScore > 0
    finally:
        service.close()


def test_lexical_search_finds_exact_terms_and_numbers(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    _ingest_three_chunks(service)
    request = SearchRequest(
        query="Pío IX 15 000 historia",
        cityQid="Q8851",
        stopQid=None,
        languages=["es"],
        sourceClasses=["archive"],
        rightsStatuses=["public_domain"],
        documentIds=None,
        publicationYearFrom=1850,
        publicationYearTo=1850,
        historicalPeriods=["19th_century"],
        minOcrConfidence=0.90,
        limit=10,
    )
    response = service.search(request)
    assert response.indexVersion is not None
    assert response.queryHash is not None
    assert len(response.hits) == 1
    hit = response.hits[0]
    assert hit.chunkId is not None
    assert hit.documentId == "doc-malaga-1"
    assert hit.pageStart == 1
    assert hit.pageEnd == 1
    assert hit.textHash is not None
    assert hit.contentHash is not None
    assert hit.sourceUrl == "https://example.org/doc-malaga-1"
    assert hit.title == "Documento Malaga 1"
    assert hit.rightsStatus == "public_domain"
    assert hit.lexicalScore is not None
    assert hit.denseScore is not None
    assert hit.fusionScore is not None
    assert hit.rerankScore is not None
    assert hit.matchedEntityQids is not None
    assert "Q3849447" in hit.matchedEntityQids


@pytest.mark.parametrize(
    "filter_kwargs,expected_chunk_ids",
    [
        ({"cityQid": "Q8851"}, {"doc-malaga-1", "doc-malaga-2"}),
        ({"cityQid": "Q5836"}, {"doc-toledo-1"}),
        ({"stopQid": "Q3849447"}, {"doc-malaga-1", "doc-malaga-2"}),
        ({"stopQid": "Q294963"}, {"doc-toledo-1"}),
        ({"languages": ["es"]}, {"doc-malaga-1", "doc-toledo-1", "doc-malaga-2"}),
        ({"languages": ["fr"]}, set()),
        ({"sourceClasses": ["archive"]}, {"doc-malaga-1", "doc-malaga-2"}),
        ({"sourceClasses": ["manuscript"]}, {"doc-toledo-1"}),
        ({"rightsStatuses": ["public_domain"]}, {"doc-malaga-1", "doc-toledo-1", "doc-malaga-2"}),
        ({"rightsStatuses": ["all_rights_reserved"]}, set()),
        ({"documentIds": ["doc-malaga-1"]}, {"doc-malaga-1"}),
        ({"documentIds": ["doc-toledo-1"]}, {"doc-toledo-1"}),
        ({"publicationYearFrom": 1850, "publicationYearTo": 1850}, {"doc-malaga-1"}),
        ({"publicationYearFrom": 1860, "publicationYearTo": 1860}, {"doc-toledo-1"}),
        ({"historicalPeriods": ["19th_century"]}, {"doc-malaga-1", "doc-toledo-1", "doc-malaga-2"}),
        ({"historicalPeriods": ["20th_century"]}, set()),
        ({"minOcrConfidence": 0.90}, {"doc-malaga-1", "doc-toledo-1"}),
        ({"minOcrConfidence": 0.95}, {"doc-malaga-1"}),
    ],
)
def test_filters_exclude_nonmatching_chunks(
    tmp_path: Path,
    filter_kwargs: dict,
    expected_chunk_ids: set[str],
) -> None:
    service = _make_service(tmp_path)
    _ingest_three_chunks(service)
    request = SearchRequest(query="historia", limit=10, **filter_kwargs)
    response = service.search(request)
    hit_document_ids = {hit.documentId for hit in response.hits}
    assert hit_document_ids == expected_chunk_ids


def test_lexical_score_direction_multi_term_query(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    try:
        _ingest_three_chunks(service)
        request = SearchRequest(
            query="historia Pío IX 15 000",
            cityQid="Q8851",
            stopQid=None,
            languages=["es"],
            sourceClasses=["archive"],
            rightsStatuses=["public_domain"],
            documentIds=None,
            publicationYearFrom=None,
            publicationYearTo=None,
            historicalPeriods=None,
            minOcrConfidence=None,
            limit=10,
        )
        response = service.search(request)
        hits_by_doc = {hit.documentId: hit for hit in response.hits}
        assert "doc-malaga-1" in hits_by_doc
        assert "doc-malaga-2" in hits_by_doc
        score_1 = hits_by_doc["doc-malaga-1"].lexicalScore
        score_2 = hits_by_doc["doc-malaga-2"].lexicalScore
        assert score_1 is not None
        assert score_2 is not None
        assert score_1 > 0
        assert score_2 > 0
        assert score_1 > score_2
    finally:
        service.close()


def test_punctuation_only_query_safety(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    try:
        _ingest_three_chunks(service)
        request = SearchRequest(
            query="!!!",
            cityQid="Q8851",
            stopQid=None,
            languages=["es"],
            sourceClasses=["archive"],
            rightsStatuses=["public_domain"],
            documentIds=None,
            publicationYearFrom=None,
            publicationYearTo=None,
            historicalPeriods=None,
            minOcrConfidence=None,
            limit=10,
        )
        response = service.search(request)
        assert response.queryHash.startswith("sha256:")
    finally:
        service.close()


def test_index_version_metadata(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    _ingest_three_chunks(service)
    metadata = service.index_version()
    assert metadata.generation is not None
    assert metadata.indexVersion is not None
    assert metadata.corpusIndexVersion is not None
    assert metadata.embeddingModel is not None
    assert metadata.embeddingDimension is not None
    assert metadata.rerankerModel is not None
    assert metadata.chunkingPolicyVersion is not None
    assert metadata.sourceRegistryVersion is not None
    assert metadata.documentCount == 3
    assert metadata.chunkCount == 3
    assert not hasattr(metadata, "queryHash")


def test_idempotent_replay_repairs_vector_index_failure(tmp_path: Path) -> None:
    db_path = tmp_path / "corpus.db"
    vector_index = FailOnceVectorIndex()
    embedding_provider = DeterministicEmbeddingProvider()
    reranker = DeterministicReranker()
    service = HistoricalCorpusService(
        db_path=db_path,
        vector_index=vector_index,
        embedding_provider=embedding_provider,
        reranker=reranker,
    )
    try:
        initial_state = service.index_version()
        assert initial_state.documentCount == 0
        assert initial_state.chunkCount == 0

        rights = RightsMetadata(
            status="public_domain",
            uri="urn:example:rights:shared",
            verifiedAt="2024-01-01T00:00:00Z",
            isExplicitlyReusable=True,
        )
        chunk = _chunk(
            original_text="El teatro romano de Málaga fue construido en época altoimperial y reutilizado en siglos posteriores.",
            corrected_text="El teatro romano de Málaga fue construido en época altoimperial y reutilizado en siglos posteriores.",
            page_start=1,
            page_end=1,
            section_path=["capitulo", "1"],
            city_qids=["Q8851"],
            entity_qids=["Q3849447"],
            historical_period="roman_to_late_antiquity",
            ocr_confidence=1.0,
        )
        request = IngestRequest(
            documentId="doc-malaga-theatre",
            sourceUrl="https://example.org/doc-malaga-theatre",
            title="Documento Malaga Teatro",
            author="Autor",
            edition="1",
            publicationYear=2026,
            language="es",
            countryCode="ES",
            sourceClass="archive",
            contentHash="sha256:" + hashlib.sha256(chunk.originalText.encode("utf-8")).hexdigest(),
            rights=rights,
            chunks=[chunk],
        )

        with pytest.raises(RuntimeError):
            service.ingest(request)
        assert vector_index.count() == 0

        result = service.ingest(request)
        assert result.documentId == "doc-malaga-theatre"
        assert len(result.chunkIds) == 1
        assert vector_index.count() == 1
        repaired_state = service.index_version()
        assert repaired_state.documentCount == 1
        assert repaired_state.chunkCount == 1

        search_request = SearchRequest(
            query="reutilización del teatro romano en siglos posteriores",
            cityQid="Q8851",
            stopQid=None,
            languages=["es"],
            sourceClasses=["archive"],
            rightsStatuses=["public_domain"],
            documentIds=None,
            publicationYearFrom=None,
            publicationYearTo=None,
            historicalPeriods=None,
            minOcrConfidence=None,
            limit=10,
        )
        response = service.search(search_request)
        assert len(response.hits) == 1
        hit = response.hits[0]
        assert hit.documentId == "doc-malaga-theatre"
        assert hit.chunkId is not None
        assert hit.denseScore is not None
        assert hit.denseScore > 0
    finally:
        service.close()
