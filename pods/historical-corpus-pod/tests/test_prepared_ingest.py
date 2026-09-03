from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from copy import deepcopy
from pathlib import Path

import pytest

from historical_corpus.backends import (
    DeterministicEmbeddingProvider,
    DeterministicReranker,
    InMemoryVectorIndex,
)
from historical_corpus.identity import canonical_json_bytes
from historical_corpus.ingest_models import FingerprintPayload, PreparedDocument
from historical_corpus.registry import CorpusRegistry
from historical_corpus.service import (
    DocumentConflictError,
    HistoricalCorpusError,
    HistoricalCorpusService,
    RecordNotFoundError,
    RightsNotReusableError,
)


_FIXTURE_PATH = Path(__file__).with_name("prepared-document.json")
_PDF_BYTES = b"%PDF-1.4\n% deterministic prepared-ingest fixture\n%%EOF\n"


class CountingEmbeddingProvider(DeterministicEmbeddingProvider):
    def __init__(self) -> None:
        super().__init__(dimension=8)
        self.document_calls = 0

    def embed_documents(self, texts):
        self.document_calls += 1
        return super().embed_documents(texts)


class CountingVectorIndex(InMemoryVectorIndex):
    def __init__(self) -> None:
        super().__init__(dimension=8)
        self.replace_calls = 0

    def replace_all(self, ids, vectors) -> None:
        self.replace_calls += 1
        super().replace_all(ids, vectors)


def _prepared_hash(payload: dict[str, object]) -> str:
    projection = deepcopy(payload)
    for field in ("preparedDocumentHash", "canonicalPdfRelativePath", "preparedAt"):
        projection.pop(field)
    return "sha256:" + hashlib.sha256(canonical_json_bytes(projection)).hexdigest()


def _publishable_prepared(
    data_root: Path,
    *,
    reusable: bool = True,
    exact_source: bool = True,
    accepted_coverage: bool = True,
    title: str | None = None,
) -> tuple[PreparedDocument, Path]:
    payload = json.loads(_FIXTURE_PATH.read_text(encoding="utf-8"))
    pdf_sha256 = "sha256:" + hashlib.sha256(_PDF_BYTES).hexdigest()
    pdf_hex = pdf_sha256.removeprefix("sha256:")
    metadata = payload["metadata"]
    gate = payload["publicationGate"]

    metadata["contentHash"] = pdf_sha256
    metadata["canonicalPdfSha256"] = pdf_sha256
    metadata["sourceIsExactRecord"] = exact_source
    gate["sourceIsExactRecord"] = exact_source
    if title is not None:
        metadata["title"] = title

    metadata["rights"]["status"] = "public_domain" if reusable else "pending_intended_use_review"
    metadata["rights"]["isExplicitlyReusable"] = reusable

    accepted_at = "2026-09-03T00:00:00+02:00" if accepted_coverage else None
    metadata["coverageAcceptedForProduct"] = accepted_coverage
    metadata["coverageAcceptedAt"] = accepted_at
    gate["coverage"]["acceptedForProduct"] = accepted_coverage
    gate["coverage"]["acceptedAt"] = accepted_at

    processing = payload["processing"]
    processing["source"]["canonicalPdfSha256"] = pdf_sha256
    processing_model = FingerprintPayload.model_validate(processing)
    processing_fingerprint = processing_model.fingerprint()
    payload["processing"] = processing_model.model_dump(
        mode="json", by_alias=True, exclude_none=False
    )
    payload["processingFingerprint"] = processing_fingerprint
    metadata["processingFingerprint"] = processing_fingerprint

    document_key = hashlib.sha256(metadata["documentId"].encode("utf-8")).hexdigest()
    relative_path = f"raw/{document_key}/{pdf_hex}.pdf"
    payload["canonicalPdfRelativePath"] = relative_path
    payload["preparedDocumentHash"] = _prepared_hash(payload)

    pdf_path = data_root / relative_path
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(_PDF_BYTES)
    return PreparedDocument.model_validate(payload), pdf_path


def _service(data_root: Path):
    embedding = CountingEmbeddingProvider()
    vector_index = CountingVectorIndex()
    service = HistoricalCorpusService(
        db_path=data_root / "corpus.sqlite3",
        data_root=data_root,
        vector_index=vector_index,
        embedding_provider=embedding,
        reranker=DeterministicReranker(),
    )
    embedding.document_calls = 0
    vector_index.replace_calls = 0
    return service, embedding, vector_index


def _assert_corpus_untouched(data_root: Path) -> None:
    registry = CorpusRegistry(str(data_root / "corpus.sqlite3"))
    try:
        assert registry.count_documents() == 0
        assert registry.count_chunks() == 0
        assert registry.read_index_sync_journal() is None
    finally:
        registry.close()


def test_publishable_fixture_is_self_consistent(tmp_path: Path) -> None:
    prepared, pdf_path = _publishable_prepared(tmp_path)
    assert prepared.metadata.rights.isExplicitlyReusable is True
    assert prepared.publicationGate.sourceIsExactRecord is True
    assert prepared.publicationGate.coverage.acceptedForProduct is True
    assert prepared.metadata.canonicalPdfSha256 == (
        "sha256:" + hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    )


def test_prepared_ingest_round_trip_and_typed_provenance(tmp_path: Path) -> None:
    prepared, expected_pdf_path = _publishable_prepared(tmp_path)
    service, embedding, vector_index = _service(tmp_path)
    with service:
        result = service.ingest_prepared(prepared)
        assert result.documentId == prepared.metadata.documentId
        assert result.chunkIds == [chunk.chunkId for chunk in prepared.chunks]
        assert embedding.document_calls == 1
        assert vector_index.replace_calls == 1

        document = service.get_document(prepared.metadata.documentId)
        chunk = service.get_chunk(result.chunkIds[0])
        pages = service.list_document_pages(prepared.metadata.documentId)
        page = service.get_document_page(
            prepared.metadata.documentId,
            prepared.pages[0].logicalPageNumber,
        )
        assert document.canonicalPdfSha256 == prepared.metadata.canonicalPdfSha256
        assert chunk.lineIds == prepared.chunks[0].lineIds
        assert [item.pageId for item in pages] == [item.pageId for item in prepared.pages]
        assert [line.lineId for line in page.lines] == prepared.chunks[0].lineIds
        assert service.canonical_pdf_path_for_rendering(
            prepared.metadata.documentId
        ) == expected_pdf_path.resolve()
        for record in (document, pages[0], page):
            assert "canonicalPdfRelativePath" not in record.model_dump(mode="json")

        registry = CorpusRegistry(str(tmp_path / "corpus.sqlite3"))
        try:
            assert registry.read_index_sync_journal() is None
            assert registry.read_index_state() is not None
        finally:
            registry.close()


@pytest.mark.parametrize("gate", ["rights", "source", "coverage"])
def test_publication_gates_fail_before_models_or_sqlite(
    tmp_path: Path,
    gate: str,
) -> None:
    prepared, _ = _publishable_prepared(
        tmp_path,
        reusable=gate != "rights",
        exact_source=gate != "source",
        accepted_coverage=gate != "coverage",
    )
    service, embedding, vector_index = _service(tmp_path)
    try:
        error_type = RightsNotReusableError if gate == "rights" else HistoricalCorpusError
        with pytest.raises(error_type):
            service.ingest_prepared(prepared)
        assert embedding.document_calls == 0
        assert vector_index.replace_calls == 0
        _assert_corpus_untouched(tmp_path)
    finally:
        service.close()


@pytest.mark.parametrize("failure", ["missing", "mismatch", "symlink", "directory"])
def test_canonical_pdf_failures_precede_models_and_sqlite(
    tmp_path: Path,
    failure: str,
) -> None:
    prepared, pdf_path = _publishable_prepared(tmp_path)
    sentinel: Path | None = None
    if failure == "missing":
        pdf_path.unlink()
    elif failure == "mismatch":
        pdf_path.write_bytes(b"different bytes")
    elif failure == "symlink":
        pdf_path.unlink()
        sentinel = tmp_path / "sentinel.pdf"
        sentinel.write_bytes(b"sentinel bytes")
        os.symlink(sentinel, pdf_path)
    else:
        pdf_path.unlink()
        pdf_path.mkdir()

    service, embedding, vector_index = _service(tmp_path)
    try:
        with pytest.raises(HistoricalCorpusError):
            service.ingest_prepared(prepared)
        assert embedding.document_calls == 0
        assert vector_index.replace_calls == 0
        _assert_corpus_untouched(tmp_path)
        if sentinel is not None:
            assert sentinel.read_bytes() == b"sentinel bytes"
    finally:
        service.close()


def test_prepared_replay_is_read_only_and_preserves_order(tmp_path: Path) -> None:
    prepared, _ = _publishable_prepared(tmp_path)
    service, embedding, vector_index = _service(tmp_path)
    try:
        first = service.ingest_prepared(prepared)
        before = service.index_version()
        embedding.document_calls = 0
        vector_index.replace_calls = 0

        replay = service.ingest_prepared(prepared)
        after = service.index_version()
        assert replay.chunkIds == first.chunkIds
        assert embedding.document_calls == 0
        assert vector_index.replace_calls == 0
        assert after.generation == before.generation
        assert after.indexVersion == before.indexVersion
    finally:
        service.close()


def test_changed_prepared_document_conflicts_before_model_or_index(tmp_path: Path) -> None:
    prepared, _ = _publishable_prepared(tmp_path)
    service, embedding, vector_index = _service(tmp_path)
    try:
        service.ingest_prepared(prepared)
        changed, _ = _publishable_prepared(tmp_path, title="Título cambiado")
        embedding.document_calls = 0
        vector_index.replace_calls = 0
        with pytest.raises(DocumentConflictError):
            service.ingest_prepared(changed)
        assert embedding.document_calls == 0
        assert vector_index.replace_calls == 0
        assert service.get_document(prepared.metadata.documentId).title == prepared.metadata.title
    finally:
        service.close()


def test_renderer_path_rejects_post_publish_substitution(tmp_path: Path) -> None:
    prepared, pdf_path = _publishable_prepared(tmp_path)
    service, _, _ = _service(tmp_path)
    try:
        service.ingest_prepared(prepared)
        assert service.canonical_pdf_path_for_rendering(
            prepared.metadata.documentId
        ) == pdf_path.resolve()

        pdf_path.unlink()
        sentinel = tmp_path / "renderer-sentinel.pdf"
        sentinel.write_bytes(b"renderer sentinel")
        os.symlink(sentinel, pdf_path)
        with pytest.raises(HistoricalCorpusError):
            service.canonical_pdf_path_for_rendering(prepared.metadata.documentId)
        assert sentinel.read_bytes() == b"renderer sentinel"
    finally:
        service.close()


def test_renderer_rejects_a_tampered_absolute_registry_path(tmp_path: Path) -> None:
    prepared, _ = _publishable_prepared(tmp_path)
    service, _, _ = _service(tmp_path)
    with service:
        service.ingest_prepared(prepared)
        with sqlite3.connect(tmp_path / "corpus.sqlite3") as connection:
            connection.execute(
                "UPDATE documents SET canonical_pdf_relative_path = ? "
                "WHERE document_id = ?",
                ("/etc/passwd", prepared.metadata.documentId),
            )
        with pytest.raises(HistoricalCorpusError):
            service.canonical_pdf_path_for_rendering(prepared.metadata.documentId)


def test_page_not_found_contract_and_context_manager_close(tmp_path: Path) -> None:
    service, _, _ = _service(tmp_path)
    with service:
        with pytest.raises(RecordNotFoundError):
            service.list_document_pages("missing-document")
        with pytest.raises(RecordNotFoundError):
            service.get_document_page("missing-document", 1)
    with pytest.raises(RuntimeError, match="closed"):
        service.index_version()


def test_missing_logical_page_raises_not_found(tmp_path: Path) -> None:
    prepared, _ = _publishable_prepared(tmp_path)
    service, _, _ = _service(tmp_path)
    try:
        service.ingest_prepared(prepared)
        with pytest.raises(RecordNotFoundError):
            service.get_document_page(prepared.metadata.documentId, 999)
    finally:
        service.close()
