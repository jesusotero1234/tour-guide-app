import asyncio
import hashlib
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Iterator

import httpx2
import pymupdf
import pytest
from fastapi.testclient import TestClient

from historical_corpus.app import create_app
from historical_corpus.backends import DeterministicEmbeddingProvider, DeterministicReranker, InMemoryVectorIndex
from historical_corpus.locks import CorpusLockError, exclusive_lock, shared_lock
from historical_corpus.models import ChunkInput, ClaimSearchRequest, IngestRequest, NormalizedBox, PageRecord, PageSummary, RightsMetadata, SearchRequest, SearchResponse, SourceLineRecord, StopSearchRequest
from historical_corpus.pdf_source import PdfSourceError
from historical_corpus.service import HistoricalCorpusError, HistoricalCorpusService, IndexRepairRequiredError, RecordNotFoundError


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


def test_injected_service_no_lifespan_lock(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    app = create_app(service=service, admin_token="test-admin-token", max_body_bytes=65536)
    try:
        with TestClient(app) as test_client:
            response = test_client.get("/health")
            assert response.status_code == 200
        assert not (tmp_path / "locks").exists(), "injected service must not create lock directory"
        assert service.index_version().generation == 0
    finally:
        service.close()


def test_owned_service_lifespan_lock(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HISTORICAL_CORPUS_DATA_DIR", str(tmp_path))

    fake_service = _make_service(tmp_path)
    calls: list[dict] = []
    close_contention = threading.Event()
    original_close = fake_service.close
    close_called = threading.Event()

    def fake_builder(environment=None, *, startup_policy="verify"):
        calls.append({"startup_policy": startup_policy})
        with pytest.raises(CorpusLockError):
            with exclusive_lock(tmp_path / "locks" / "corpus.lock"):
                pass
        return fake_service

    monkeypatch.setattr("historical_corpus.runtime.build_service_from_env", fake_builder)

    def wrapped_close():
        close_contention.set()
        with pytest.raises(CorpusLockError):
            with exclusive_lock(tmp_path / "locks" / "corpus.lock"):
                pass
        close_called.set()
        original_close()

    fake_service.close = wrapped_close

    app = create_app()
    try:
        with TestClient(app) as test_client:
            assert len(calls) == 1
            assert calls[0]["startup_policy"] == "verify"
            response = test_client.get("/health")
            assert response.status_code == 200
            with pytest.raises(CorpusLockError):
                with exclusive_lock(tmp_path / "locks" / "corpus.lock"):
                    pass
    finally:
        if not close_called.is_set():
            original_close()

    assert close_contention.is_set(), "exclusive lock must still be held during close"
    assert close_called.is_set(), "original close must be invoked exactly once"
    with exclusive_lock(tmp_path / "locks" / "corpus.lock"):
        pass


def test_pre_held_exclusive_lock_raises_corpus_lock_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HISTORICAL_CORPUS_DATA_DIR", str(tmp_path))

    fake_service = _make_service(tmp_path)
    builder_called = threading.Event()

    def fake_builder(environment=None, *, startup_policy="verify"):
        builder_called.set()
        return fake_service

    monkeypatch.setattr("historical_corpus.runtime.build_service_from_env", fake_builder)

    lock_path = tmp_path / "locks" / "corpus.lock"
    try:
        with exclusive_lock(lock_path):
            app = create_app()
            with pytest.raises(CorpusLockError):
                with TestClient(app) as test_client:
                    test_client.get("/health")

        assert not builder_called.is_set(), "builder must not be called when lock is pre-held"
    finally:
        fake_service.close()


def test_index_repair_required_error_propagates(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HISTORICAL_CORPUS_DATA_DIR", str(tmp_path))

    fake_service = _make_service(tmp_path)
    calls: list[dict] = []

    def fake_builder(environment=None, *, startup_policy="verify"):
        calls.append({"startup_policy": startup_policy})
        raise IndexRepairRequiredError("index needs repair")

    monkeypatch.setattr("historical_corpus.runtime.build_service_from_env", fake_builder)

    try:
        app = create_app()
        with pytest.raises(IndexRepairRequiredError):
            with TestClient(app) as test_client:
                test_client.get("/health")

        assert len(calls) == 1
        assert calls[0]["startup_policy"] == "verify"
    finally:
        fake_service.close()


def test_explicit_lifespan_lock_injected_service(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    entered = threading.Event()
    exited = threading.Event()

    @contextmanager
    def custom_lock() -> Iterator[None]:
        entered.set()
        yield
        exited.set()

    app = create_app(
        service=service,
        admin_token="test-admin-token",
        max_body_bytes=65536,
        lifespan_lock=custom_lock,
    )
    try:
        with TestClient(app) as test_client:
            assert entered.is_set(), "lifespan_lock must be entered"
            response = test_client.get("/health")
            assert response.status_code == 200
            assert not exited.is_set(), "lifespan_lock must not be exited during lifespan"

        assert exited.is_set(), "lifespan_lock must be exited after TestClient exits"
        assert service.index_version().generation == 0
    finally:
        service.close()


def _page_summary_fields(document_id: str, logical_page_number: int) -> dict[str, object]:
    return {
        "documentId": document_id,
        "logicalPageNumber": logical_page_number,
        "pageId": f"sha256:{logical_page_number - 1:064x}",
        "sourcePdfPageNumber": logical_page_number,
        "leafSide": "full",
        "continuityBreakBefore": False,
        "printedPageLabel": str(logical_page_number),
        "contentClass": "normal",
        "textSource": "ppocrv6",
        "qualityScore": 0.9,
        "qualityFlags": [],
        "workId": "madoz-diccionario",
        "volumeNumber": 1,
        "repositoryName": "Biblioteca Digital",
        "historicalPeriod": "1845-1850",
        "temporalScope": "España, siglo XIX",
        "attribution": "Pascual Madoz",
        "sourceIsExactRecord": True,
        "canonicalPdfSha256": "sha256:" + "b" * 64,
        "processingFingerprint": "sha256:" + "c" * 64,
        "pageInventorySha256": "sha256:" + "d" * 64,
        "inventoryVerifiedAt": "2024-01-01T00:00:00Z",
        "sourceUrl": "https://example.test/madoz-record",
        "rightsStatus": "public_domain",
        "rightsUri": "https://example.test/rights/public-domain",
        "rightsVerifiedAt": "2024-01-01T00:00:00Z",
        "rightsIsExplicitlyReusable": True,
        "coverageStatus": "unknown",
        "coverageStatement": None,
        "observedPrintedRanges": [],
        "missingPrintedPages": [],
        "coverageAcceptedForProduct": False,
        "coverageAcceptedAt": None,
    }


class _FakePageService:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple]] = []
        self.missing: bool = False

    def list_document_pages(self, document_id: str) -> list[PageSummary]:
        self.calls.append(("list_document_pages", (document_id,)))
        if self.missing:
            raise RecordNotFoundError("document not found", details={"documentId": document_id})
        return [
            PageSummary(**_page_summary_fields(document_id, 1)),
            PageSummary(**_page_summary_fields(document_id, 2)),
        ]

    def get_document_page(self, document_id: str, logical_page_number: int) -> PageRecord:
        self.calls.append(("get_document_page", (document_id, logical_page_number)))
        if self.missing:
            raise RecordNotFoundError(
                "page not found",
                details={"documentId": document_id, "logicalPageNumber": logical_page_number},
            )
        return PageRecord(
            **_page_summary_fields(document_id, logical_page_number),
            cropBox=NormalizedBox(x0=0.0, y0=0.0, x1=1.0, y1=1.0),
            rotationDegrees=0,
            widthPx=1000,
            heightPx=1400,
            renderDpi=300,
            rasterizationPolicy="crop",
            imageSha256="sha256:" + "c" * 64,
            foregroundRatio=0.15,
            meanConfidence=0.92,
            lowConfidenceRatio=0.03,
            ocrEngine="transformers",
            ocrEngineVersion="4.57.1",
            ocrDetectionModel="PaddlePaddle/PP-OCRv5_mobile_det",
            ocrRecognitionModel="PaddlePaddle/PP-OCRv5_server_rec",
            originalText="line one\nline two",
            lines=[
                SourceLineRecord(
                    lineId="sha256:" + "d" * 64,
                    lineOrder=0,
                    originalText="line one",
                    confidence=0.95,
                    box=NormalizedBox(x0=0.0, y0=0.0, x1=1.0, y1=0.5),
                    orientationDegrees=0,
                    role="body",
                ),
                SourceLineRecord(
                    lineId="sha256:" + "e" * 64,
                    lineOrder=1,
                    originalText="line two",
                    confidence=0.91,
                    box=NormalizedBox(x0=0.0, y0=0.5, x1=1.0, y1=1.0),
                    orientationDegrees=0,
                    role="body",
                ),
            ],
        )


def _make_page_client(tmp_path: Path) -> tuple[TestClient, _FakePageService]:
    fake_service = _FakePageService()
    app = create_app(service=fake_service, admin_token="test-admin-token", max_body_bytes=65536)
    return TestClient(app), fake_service


def test_list_document_pages_no_auth(tmp_path: Path) -> None:
    client, fake_service = _make_page_client(tmp_path)
    try:
        response = client.get("/v1/documents/doc-1/pages")
        assert response.status_code == 200
        data = response.json()
        assert data[0]["documentId"] == "doc-1"
        assert data[0]["logicalPageNumber"] == 1
        assert data[1]["logicalPageNumber"] == 2
        for item in data:
            for key, value in item.items():
                assert key not in ("path",)
                if isinstance(value, str):
                    assert "/data" not in value
                    assert ".pdf" not in value
        assert fake_service.calls == [("list_document_pages", ("doc-1",))]
    finally:
        client.close()


def test_get_document_page_detail(tmp_path: Path) -> None:
    client, fake_service = _make_page_client(tmp_path)
    try:
        response = client.get("/v1/documents/doc-1/pages/1")
        assert response.status_code == 200
        data = response.json()
        assert data["documentId"] == "doc-1"
        assert data["logicalPageNumber"] == 1
        assert [line["lineOrder"] for line in data["lines"]] == [0, 1]
        assert [line["originalText"] for line in data["lines"]] == ["line one", "line two"]
        assert fake_service.calls == [("get_document_page", ("doc-1", 1))]
    finally:
        client.close()


@pytest.mark.parametrize("path", ["/v1/documents/doc-1/pages", "/v1/documents/doc-1/pages/1"])
def test_page_missing_404(tmp_path: Path, path: str) -> None:
    client, fake_service = _make_page_client(tmp_path)
    try:
        fake_service.missing = True
        response = client.get(path)
        assert response.status_code == 404
        body = response.json()
        assert body["error"]["code"] == "NOT_FOUND"
        assert body["error"]["details"]["documentId"] == "doc-1"
    finally:
        client.close()


PAGE_ID_HEX = "a" * 64
CANONICAL_SHA256_HEX = "b" * 64


class _FakePreviewService:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple]] = []
        self.page = SimpleNamespace(
            pageId=f"sha256:{PAGE_ID_HEX}",
            sourcePdfPageNumber=3,
            leafSide="full",
            cropBox=SimpleNamespace(x0=0.1, y0=0.2, x1=0.9, y1=0.8),
            rotationDegrees=0,
            contentClass="normal",
            canonicalPdfSha256=f"sha256:{CANONICAL_SHA256_HEX}",
        )

    def get_document_page(self, document_id: str, logical_page_number: int) -> SimpleNamespace:
        self.calls.append(("get_document_page", (document_id, logical_page_number)))
        return self.page

    def canonical_pdf_path_for_rendering(self, document_id: str) -> Path:
        self.calls.append(("canonical_pdf_path_for_rendering", (document_id,)))
        return Path("/data/canonical.pdf")


def _make_preview_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[TestClient, _FakePreviewService]:
    monkeypatch.setenv("HISTORICAL_CORPUS_DATA_DIR", str(tmp_path / "data"))
    fake_service = _FakePreviewService()
    app = create_app(service=fake_service, admin_token="test-admin-token", max_body_bytes=65536)
    return TestClient(app), fake_service


def test_preview_success_and_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client, fake_service = _make_preview_client(tmp_path, monkeypatch)
    try:
        deterministic_png = b"PNG-DATA-1"
        canonical_path = Path("/data/canonical.pdf")
        fake_page = fake_service.page

        verify_calls: list[tuple] = []
        render_calls: list[tuple] = []

        def fake_verify(path: Path, sha256: str) -> None:
            verify_calls.append((path, sha256))

        def fake_render(path: Path, page: SimpleNamespace) -> bytes:
            render_calls.append((path, page))
            return deterministic_png

        monkeypatch.setattr("historical_corpus.app.verify_pdf_sha256", fake_verify, raising=False)
        monkeypatch.setattr("historical_corpus.app._render_preview_png", fake_render, raising=False)

        response = client.get("/v1/documents/doc-1/pages/1/image")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        expected_etag = f'"sha256:{hashlib.sha256(deterministic_png).hexdigest()}"'
        assert response.headers["etag"] == expected_etag
        assert fake_service.calls == [
            ("get_document_page", ("doc-1", 1)),
            ("canonical_pdf_path_for_rendering", ("doc-1",)),
        ]
        assert verify_calls == [(canonical_path, f"sha256:{CANONICAL_SHA256_HEX}")]
        assert render_calls == [(canonical_path, fake_page)]

        cache_dir = tmp_path / "data" / "previews"
        cache_file = cache_dir / f"{PAGE_ID_HEX}-{hashlib.sha256(('pymupdf-preview-crop-png-v1\n' + pymupdf.__version__ + '\n144').encode('utf-8')).hexdigest()}.png"
        assert cache_file.exists()
        assert cache_file.read_bytes() == deterministic_png
        leftover = [p for p in cache_dir.iterdir() if p.name != cache_file.name]
        assert not leftover

        response2 = client.get("/v1/documents/doc-1/pages/1/image", headers={"If-None-Match": expected_etag})
        assert response2.status_code == 304
        assert response2.content == b""
        assert response2.headers["etag"] == expected_etag
        assert fake_service.calls == [
            ("get_document_page", ("doc-1", 1)),
            ("canonical_pdf_path_for_rendering", ("doc-1",)),
            ("get_document_page", ("doc-1", 1)),
            ("canonical_pdf_path_for_rendering", ("doc-1",)),
        ]
        assert verify_calls == [
            (canonical_path, f"sha256:{CANONICAL_SHA256_HEX}"),
            (canonical_path, f"sha256:{CANONICAL_SHA256_HEX}"),
        ]
        assert render_calls == [(canonical_path, fake_page)]
    finally:
        client.close()


@pytest.mark.parametrize("query_key", ["path", "crop", "dpi", "filename"])
def test_preview_invalid_query_422(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, query_key: str) -> None:
    client, fake_service = _make_preview_client(tmp_path, monkeypatch)
    try:
        response = client.get(f"/v1/documents/doc-1/pages/1/image?{query_key}=/etc/passwd")
        assert response.status_code == 422
        body = response.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert fake_service.calls == []
        assert "/etc/passwd" not in response.text
    finally:
        client.close()


def test_preview_sha_mismatch_409(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client, fake_service = _make_preview_client(tmp_path, monkeypatch)
    try:
        def fake_verify(*args, **kwargs):
            raise PdfSourceError("sha mismatch")

        monkeypatch.setattr("historical_corpus.app.verify_pdf_sha256", fake_verify, raising=False)
        response = client.get("/v1/documents/doc-1/pages/1/image")
        assert response.status_code == 409
        body = response.json()
        assert body["error"]["code"] == "CANONICAL_PDF_ERROR"
        assert response.headers.get("content-type", "").startswith("application/json")
        assert not (tmp_path / "data" / "previews").exists()
    finally:
        client.close()


def test_preview_traversal_500(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client, fake_service = _make_preview_client(tmp_path, monkeypatch)
    try:
        def fake_canonical(*args, **kwargs):
            fake_service.calls.append(("canonical_pdf_path_for_rendering", ("doc-1",)))
            raise HistoricalCorpusError(
                "canonical PDF path is not a valid relative layout",
                details={"documentId": "doc-1"},
            )

        monkeypatch.setattr(fake_service, "canonical_pdf_path_for_rendering", fake_canonical)
        response = client.get("/v1/documents/doc-1/pages/1/image")
        assert response.status_code == 500
        body = response.json()
        assert body["error"]["code"] == "HISTORICAL_CORPUS_ERROR"
        assert "/etc/passwd" not in response.text
        assert "/data/canonical.pdf" not in response.text
    finally:
        client.close()


def test_strong_etag_differs_for_different_pngs() -> None:
    from historical_corpus.app import _strong_etag

    etag1 = _strong_etag(b"PNG-A")
    etag2 = _strong_etag(b"PNG-B")
    assert etag1 != etag2
    assert etag1.startswith('"sha256:')
    assert etag2.startswith('"sha256:')


def test_preview_renderer_key_versioned() -> None:
    from historical_corpus.app import _preview_renderer_key

    expected = hashlib.sha256(
        ("pymupdf-preview-crop-png-v1\n" + pymupdf.__version__ + "\n144").encode("utf-8")
    ).hexdigest()
    assert _preview_renderer_key() == expected

    key_policy_v2 = _preview_renderer_key(policy_version="v2")
    assert key_policy_v2 != expected

    key_pymupdf_v99 = _preview_renderer_key(pymupdf_version="99.0.0")
    assert key_pymupdf_v99 != expected


def test_render_preview_png_uses_page_crop(monkeypatch: pytest.MonkeyPatch) -> None:
    from historical_corpus.app import _render_preview_png

    captured: list[SimpleNamespace] = []

    def fake_render_preview(pdf_path: Path, candidate: SimpleNamespace) -> SimpleNamespace:
        captured.append(candidate)
        return SimpleNamespace(width_px=1, height_px=1, rgb_bytes=b"\x00\x00\x00")

    monkeypatch.setattr("historical_corpus.app.render_preview", fake_render_preview, raising=False)

    fake_page = SimpleNamespace(
        pageId=f"sha256:{PAGE_ID_HEX}",
        sourcePdfPageNumber=3,
        leafSide="full",
        cropBox=SimpleNamespace(x0=0.1, y0=0.2, x1=0.9, y1=0.8),
        rotationDegrees=0,
        contentClass="normal",
        canonicalPdfSha256=f"sha256:{CANONICAL_SHA256_HEX}",
    )

    pdf_path = Path("/data/canonical.pdf")
    result = _render_preview_png(pdf_path, fake_page)

    assert result.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(captured) == 1
    candidate = captured[0]
    assert candidate.pdf_page == 3
    assert candidate.side == "full"
    assert candidate.crop_box == (0.1, 0.2, 0.9, 0.8)
    assert candidate.rotation_degrees == 0
    assert candidate.content_class == "normal"
    assert candidate.table_regions == ()


def test_preview_symlink_hardening_500(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    data_dir = tmp_path / "data"
    outside_dir = tmp_path / "outside"
    outside_dir.mkdir()
    previews_path = data_dir / "previews"
    data_dir.mkdir()
    previews_path.symlink_to(outside_dir)

    fake_service = _FakePreviewService()
    app = create_app(service=fake_service, admin_token="test-admin-token", max_body_bytes=65536)
    client = TestClient(app)
    try:
        monkeypatch.setenv("HISTORICAL_CORPUS_DATA_DIR", str(data_dir))

        def fake_verify(*args, **kwargs) -> None:
            pass

        monkeypatch.setattr("historical_corpus.app.verify_pdf_sha256", fake_verify, raising=False)

        response = client.get("/v1/documents/doc-1/pages/1/image")
        assert response.status_code == 500
        body = response.json()
        assert "error" in body
        assert body["error"]["code"] == "HISTORICAL_CORPUS_ERROR"
        assert not list(outside_dir.iterdir())
    finally:
        client.close()
