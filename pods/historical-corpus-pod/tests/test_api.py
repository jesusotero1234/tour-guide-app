import asyncio
import hashlib
import threading
import time
from pathlib import Path

import httpx2
import pytest
from fastapi.testclient import TestClient

from historical_corpus.app import create_app
from historical_corpus.backends import DeterministicEmbeddingProvider, DeterministicReranker, InMemoryVectorIndex
from historical_corpus.models import ChunkInput, ClaimSearchRequest, IngestRequest, RightsMetadata, SearchRequest, SearchResponse, StopSearchRequest
from historical_corpus.service import HistoricalCorpusService


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


def _ingest_request(
    document_id: str,
    original_text: str,
    corrected_text: str,
    city_qids: list[str],
    entity_qids: list[str],
    rights_status: str = "public_domain",
    is_reusable: bool = True,
) -> IngestRequest:
    rights = RightsMetadata(
        status=rights_status,
        uri=f"urn:example:rights:{document_id}",
        verifiedAt="2024-01-01T00:00:00Z",
        isExplicitlyReusable=is_reusable,
    )
    chunk = _chunk(
        original_text=original_text,
        corrected_text=corrected_text,
        page_start=1,
        page_end=1,
        section_path=["capitulo", "1"],
        city_qids=city_qids,
        entity_qids=entity_qids,
        historical_period="19th_century",
        ocr_confidence=0.95,
    )
    content_hash = "sha256:" + hashlib.sha256(original_text.encode("utf-8")).hexdigest()
    return IngestRequest(
        documentId=document_id,
        sourceUrl=f"https://example.org/{document_id}",
        title=f"Documento {document_id}",
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


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    service = _make_service(tmp_path)
    app = create_app(service=service, admin_token="test-admin-token", max_body_bytes=65536)
    with TestClient(app) as test_client:
        yield test_client
    service.close()


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_index_version(client: TestClient) -> None:
    response = client.get("/v1/index/version")
    assert response.status_code == 200
    data = response.json()
    assert "generation" in data
    assert "indexVersion" in data
    assert "corpusIndexVersion" in data
    assert "embeddingModel" in data
    assert "embeddingDimension" in data
    assert "rerankerModel" in data
    assert "chunkingPolicyVersion" in data
    assert "sourceRegistryVersion" in data
    assert "documentCount" in data
    assert "chunkCount" in data


@pytest.mark.parametrize("auth_header", [None, "Bearer wrong-token"])
def test_ingest_requires_bearer_token(client: TestClient, auth_header: str | None) -> None:
    request = _ingest_request("doc-no-auth", "Texto sin auth", "Texto sin auth corregido", ["Q8851"], ["Q3849447"])
    headers = {"Authorization": auth_header} if auth_header is not None else {}
    response = client.post("/v1/ingest", json=request.model_dump(), headers=headers)
    assert response.status_code == 401
    body = response.json()
    assert "error" in body
    assert body["error"]["code"] == "UNAUTHORIZED"


def test_ingest_success(client: TestClient) -> None:
    request = _ingest_request("doc-ok", "Texto reutilizable", "Texto reutilizable corregido", ["Q8851"], ["Q3849447"])
    response = client.post(
        "/v1/ingest",
        json=request.model_dump(),
        headers={"Authorization": "Bearer test-admin-token"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["documentId"] == "doc-ok"
    assert len(data["chunkIds"]) == 1


def test_ingest_idempotent_replay(client: TestClient) -> None:
    request = _ingest_request("doc-replay", "Texto replay", "Texto replay corregido", ["Q8851"], ["Q3849447"])
    headers = {"Authorization": "Bearer test-admin-token"}
    response1 = client.post("/v1/ingest", json=request.model_dump(), headers=headers)
    assert response1.status_code == 200
    response2 = client.post("/v1/ingest", json=request.model_dump(), headers=headers)
    assert response2.status_code == 200
    assert response1.json() == response2.json()


def test_ingest_conflict_same_id_different_content(client: TestClient) -> None:
    request_a = _ingest_request("doc-conflict", "Contenido A", "Contenido A corregido", ["Q8851"], ["Q3849447"])
    headers = {"Authorization": "Bearer test-admin-token"}
    client.post("/v1/ingest", json=request_a.model_dump(), headers=headers)

    request_b = _ingest_request("doc-conflict", "Contenido B diferente", "Contenido B corregido", ["Q5836"], ["Q294963"])
    response = client.post("/v1/ingest", json=request_b.model_dump(), headers=headers)
    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "DOCUMENT_CONFLICT"


def test_ingest_rights_gate_422(client: TestClient) -> None:
    request = _ingest_request(
        "doc-rights",
        "Texto no reutilizable",
        "Texto no reutilizable corregido",
        ["Q8851"],
        ["Q3849447"],
        rights_status="all_rights_reserved",
        is_reusable=False,
    )
    response = client.post(
        "/v1/ingest",
        json=request.model_dump(),
        headers={"Authorization": "Bearer test-admin-token"},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "REUSE_RIGHTS_NOT_VERIFIED"


def test_ingest_invalid_qid_422(client: TestClient) -> None:
    request = _ingest_request("doc-bad-qid", "Texto qid invalido", "Texto qid invalido corregido", ["Q8851"], ["Q3849447"])
    payload = request.model_dump()
    payload["chunks"][0]["cityQids"] = ["INVALID"]
    response = client.post(
        "/v1/ingest",
        json=payload,
        headers={"Authorization": "Bearer test-admin-token"},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_get_chunk_success(client: TestClient) -> None:
    request = _ingest_request("doc-chunk", "Texto chunk", "Texto chunk corregido", ["Q8851"], ["Q3849447"])
    response = client.post(
        "/v1/ingest",
        json=request.model_dump(),
        headers={"Authorization": "Bearer test-admin-token"},
    )
    chunk_id = response.json()["chunkIds"][0]
    chunk_response = client.get(f"/v1/chunks/{chunk_id}")
    assert chunk_response.status_code == 200
    data = chunk_response.json()
    assert data["chunkId"] == chunk_id
    assert data["documentId"] == "doc-chunk"
    assert data["originalText"] == "Texto chunk"
    assert data["correctedText"] == "Texto chunk corregido"
    assert data["cityQids"] == ["Q8851"]
    assert data["entityQids"] == ["Q3849447"]


def test_get_chunk_missing_404(client: TestClient) -> None:
    response = client.get("/v1/chunks/nonexistent-chunk")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "NOT_FOUND"


def test_get_document_success(client: TestClient) -> None:
    request = _ingest_request("doc-doc", "Texto doc", "Texto doc corregido", ["Q8851"], ["Q3849447"])
    client.post(
        "/v1/ingest",
        json=request.model_dump(),
        headers={"Authorization": "Bearer test-admin-token"},
    )
    response = client.get("/v1/documents/doc-doc")
    assert response.status_code == 200
    data = response.json()
    assert data["documentId"] == "doc-doc"
    assert data["title"] == "Documento doc-doc"
    assert data["rightsStatus"] == "public_domain"


def test_get_document_missing_404(client: TestClient) -> None:
    response = client.get("/v1/documents/nonexistent-doc")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "NOT_FOUND"


def test_search_success(client: TestClient) -> None:
    request = _ingest_request("doc-search", "Texto búsqueda", "Texto búsqueda corregido", ["Q8851"], ["Q3849447"])
    client.post(
        "/v1/ingest",
        json=request.model_dump(),
        headers={"Authorization": "Bearer test-admin-token"},
    )
    search_request = SearchRequest(query="búsqueda", cityQid="Q8851")
    response = client.post("/v1/search", json=search_request.model_dump())
    assert response.status_code == 200
    data = response.json()
    assert "queryHash" in data
    assert "indexVersion" in data
    assert "hits" in data
    assert len(data["hits"]) >= 1
    hit = data["hits"][0]
    assert "chunkId" in hit
    assert "documentId" in hit
    assert "lexicalScore" in hit
    assert "denseScore" in hit
    assert "fusionScore" in hit
    assert "rerankScore" in hit


def test_search_for_stop(client: TestClient) -> None:
    request = _ingest_request("doc-stop", "Texto stop", "Texto stop corregido", ["Q8851"], ["Q3849447"])
    client.post(
        "/v1/ingest",
        json=request.model_dump(),
        headers={"Authorization": "Bearer test-admin-token"},
    )
    body = {
        "cityQid": "Q8851",
        "stopQid": "Q3849447",
        "labels": ["label1"],
        "missingRoles": ["role1"],
        "query": "stop query",
        "languages": ["es"],
        "sourceClasses": ["archive"],
        "rightsStatuses": ["public_domain"],
        "documentIds": ["doc-stop"],
        "publicationYearFrom": 1800,
        "publicationYearTo": 1900,
        "historicalPeriods": ["19th_century"],
        "minOcrConfidence": 0.9,
        "limit": 10,
    }
    response = client.post("/v1/search-for-stop", json=body)
    assert response.status_code == 200
    data = response.json()
    assert "queryHash" in data
    assert "indexVersion" in data
    assert "hits" in data


def test_search_for_claim(client: TestClient) -> None:
    request = _ingest_request("doc-claim", "Texto claim", "Texto claim corregido", ["Q8851"], ["Q3849447"])
    client.post(
        "/v1/ingest",
        json=request.model_dump(),
        headers={"Authorization": "Bearer test-admin-token"},
    )
    body = {
        "cityQid": "Q8851",
        "stopQid": "Q3849447",
        "claim": "claim text",
        "query": "claim query",
        "languages": ["es"],
        "sourceClasses": ["archive"],
        "rightsStatuses": ["public_domain"],
        "documentIds": ["doc-claim"],
        "publicationYearFrom": 1800,
        "publicationYearTo": 1900,
        "historicalPeriods": ["19th_century"],
        "minOcrConfidence": 0.9,
        "limit": 10,
    }
    response = client.post("/v1/search-for-claim", json=body)
    assert response.status_code == 200
    data = response.json()
    assert "queryHash" in data
    assert "indexVersion" in data
    assert "hits" in data


def test_stop_search_request_preserves_context() -> None:
    stop_req = StopSearchRequest(
        query="original query",
        cityQid="Q8851",
        stopQid="Q3849447",
        labels=["label1", "label2"],
        missingRoles=["role1", "role2"],
    )
    result = stop_req.to_search_request()
    expected_query = "original query\nAliases: label1 | label2\nMissing evidence roles: role1, role2"
    assert result.query == expected_query
    dump = result.model_dump()
    assert "labels" not in dump
    assert "missingRoles" not in dump


def test_claim_search_request_preserves_context() -> None:
    claim_req = ClaimSearchRequest(
        query="original query",
        cityQid="Q8851",
        stopQid="Q3849447",
        claim="claim text",
    )
    result = claim_req.to_search_request()
    expected_query = "original query\nClaim to verify: claim text"
    assert result.query == expected_query
    dump = result.model_dump()
    assert "claim" not in dump


def test_payload_too_large_413(client: TestClient) -> None:
    raw_body = b'{"padding":"' + (b"x" * 70000) + b'"}'
    response = client.post(
        "/v1/ingest",
        content=raw_body,
        headers={"Authorization": "Bearer test-admin-token", "Content-Type": "application/json"},
    )
    assert response.status_code == 413
    body = response.json()
    assert body["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_slow_search_does_not_block_health(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    started = threading.Event()
    release = threading.Event()

    def blocking_search(payload: SearchRequest) -> SearchResponse:
        started.set()
        release.wait(timeout=2.0)
        return SearchResponse(
            queryHash="sha256:" + "0" * 64,
            indexVersion="1",
            hits=[],
        )

    service.search = blocking_search
    app = create_app(service=service)

    async def run_test() -> None:
        transport = httpx2.ASGITransport(app=app)
        async with httpx2.AsyncClient(transport=transport, base_url="http://test") as client:
            start_time = time.monotonic()
            search_task = asyncio.create_task(
                client.post("/v1/search", json={"query": "test", "cityQid": "Q8851"})
            )
            timer = threading.Timer(0.5, release.set)
            timer.start()
            await asyncio.sleep(0)
            health_response = await client.get("/health")
            elapsed = time.monotonic() - start_time
            assert health_response.status_code == 200
            assert health_response.json() == {"status": "ok"}
            assert elapsed < 0.25
            release.set()
            search_response = await search_task
            assert search_response.status_code == 200
            timer.cancel()

    try:
        asyncio.run(run_test())
    finally:
        service.close()
