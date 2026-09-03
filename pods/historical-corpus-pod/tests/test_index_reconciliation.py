from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pytest

from historical_corpus.backends import (
    DeterministicEmbeddingProvider,
    DeterministicReranker,
    InMemoryVectorIndex,
)
from historical_corpus.models import ChunkInput, IngestRequest, RightsMetadata, SearchRequest
from historical_corpus.registry import (
    CorpusRegistry,
    IndexTargetConfig,
    _compute_chunk_id,
)
from historical_corpus.service import (
    HistoricalCorpusService,
    IndexRepairRequiredError,
)


_DIMENSION = 8


class NamedEmbeddingProvider(DeterministicEmbeddingProvider):
    def __init__(self, model_id: str = "test-embedding-v1") -> None:
        super().__init__(dimension=_DIMENSION)
        self.model_id = model_id


class NamedReranker(DeterministicReranker):
    def __init__(self, model_id: str = "test-reranker-v1") -> None:
        super().__init__()
        self.model_id = model_id


class TrackingVectorIndex(InMemoryVectorIndex):
    def __init__(self, *, persistent: bool) -> None:
        super().__init__(dimension=_DIMENSION)
        self.is_persistent = persistent
        self.replace_calls = 0
        self.upsert_calls = 0
        self.fail_phase: str | None = None

    def reset_calls(self) -> None:
        self.replace_calls = 0
        self.upsert_calls = 0

    def upsert(self, ids, vectors) -> None:
        self.upsert_calls += 1
        super().upsert(ids, vectors)

    def replace_all(self, ids, vectors) -> None:
        self.replace_calls += 1
        fail_phase = self.fail_phase
        self.fail_phase = None
        if fail_phase == "before":
            raise RuntimeError("injected failure before replace")
        super().replace_all(ids, vectors)
        if fail_phase == "after":
            raise RuntimeError("injected failure after replace")

    def artifact_sha256(self) -> str:
        authority_hash = super().artifact_sha256()
        if not self.is_persistent:
            return authority_hash
        payload = f"tracking-persistent-v1:{authority_hash}".encode("ascii")
        return "sha256:" + hashlib.sha256(payload).hexdigest()


def _target(
    embedding: NamedEmbeddingProvider | None = None,
    reranker: NamedReranker | None = None,
    *,
    bit_width: int = 4,
) -> IndexTargetConfig:
    embedding = embedding or NamedEmbeddingProvider()
    reranker = reranker or NamedReranker()
    return IndexTargetConfig(
        embedding_model=embedding.model_id,
        embedding_dimension=embedding.dimension,
        reranker_model=reranker.model_id,
        vector_index_backend="turbovec",
        vector_index_bit_width=bit_width,
    )


def _request(*, title: str = "Documento de prueba", chunk_count: int = 1) -> IngestRequest:
    chunks = [
        ChunkInput(
            originalText=f"Texto histórico de Málaga, fragmento {index}.",
            correctedText=f"Texto histórico de Málaga, fragmento {index}.",
            pageStart=index + 1,
            pageEnd=index + 1,
            sectionPath=["Málaga", str(index + 1)],
            cityQids=["Q8851"],
            entityQids=["Q3849447"],
            historicalPeriod="19th_century",
            ocrConfidence=0.99,
        )
        for index in range(chunk_count)
    ]
    source_text = "\n".join(chunk.originalText for chunk in chunks)
    return IngestRequest(
        documentId="reconciliation-document",
        sourceUrl="https://example.org/reconciliation-document.pdf",
        title=title,
        author="Autor de prueba",
        edition="Edición abierta",
        publicationYear=1850,
        language="es",
        countryCode="ES",
        sourceClass="historical_primary",
        contentHash="sha256:" + hashlib.sha256(source_text.encode("utf-8")).hexdigest(),
        rights=RightsMetadata(
            status="public_domain",
            uri="https://example.org/rights/public-domain",
            verifiedAt="2026-09-03T00:00:00Z",
            isExplicitlyReusable=True,
        ),
        chunks=chunks,
    )


def _search() -> SearchRequest:
    return SearchRequest(
        query="historia de Málaga",
        cityQid="Q8851",
        rightsStatuses=["public_domain"],
        limit=5,
    )


def _matrix_from_blobs(blobs: tuple[bytes, ...]) -> np.ndarray:
    if not blobs:
        return np.empty((0, _DIMENSION), dtype=np.float32)
    return np.stack(
        [np.frombuffer(blob, dtype="<f4").astype(np.float32) for blob in blobs]
    )


def _embedding_payloads(
    request: IngestRequest,
    embedding: NamedEmbeddingProvider,
) -> dict[str, bytes]:
    texts = [chunk.correctedText or chunk.originalText for chunk in request.chunks]
    vectors = np.asarray(embedding.embed_documents(texts), dtype="<f4")
    result: dict[str, bytes] = {}
    for chunk, vector in zip(request.chunks, vectors, strict=True):
        chunk_id = _compute_chunk_id(
            request.documentId,
            chunk.pageStart,
            chunk.pageEnd,
            chunk.sectionPath,
            chunk.originalText,
        )
        result[chunk_id] = vector.tobytes(order="C")
    return result


def _seed_healthy(
    db_path: Path,
    index: TrackingVectorIndex,
    *,
    request: IngestRequest | None = None,
    embedding: NamedEmbeddingProvider | None = None,
    reranker: NamedReranker | None = None,
    bit_width: int = 4,
):
    request = request or _request()
    embedding = embedding or NamedEmbeddingProvider()
    reranker = reranker or NamedReranker()
    registry = CorpusRegistry(str(db_path))
    try:
        chunk_ids = registry.atomically_insert_document(
            request,
            _embedding_payloads(request, embedding),
            target=_target(embedding, reranker, bit_width=bit_width),
        )
        journal = registry.read_index_sync_journal()
        assert journal is not None
        authority = registry.load_embedding_authority(
            _target(embedding, reranker, bit_width=bit_width)
        )
        index.replace_all(
            authority.vector_ids,
            _matrix_from_blobs(authority.vector_blobs),
        )
        state = registry.finalize_index_sync(journal, index.artifact_sha256())
        vector_ids = set(authority.vector_ids)
    finally:
        registry.close()
    index.reset_calls()
    return chunk_ids, vector_ids, state


def _service(
    db_path: Path,
    index: TrackingVectorIndex,
    *,
    startup_policy: str = "verify",
    embedding: NamedEmbeddingProvider | None = None,
    reranker: NamedReranker | None = None,
    bit_width: int = 4,
) -> HistoricalCorpusService:
    return HistoricalCorpusService(
        db_path=db_path,
        vector_index=index,
        embedding_provider=embedding or NamedEmbeddingProvider(),
        reranker=reranker or NamedReranker(),
        startup_policy=startup_policy,
        vector_index_backend="turbovec",
        vector_index_bit_width=bit_width,
    )


def _assert_repair_required(callable_) -> None:
    with pytest.raises(IndexRepairRequiredError) as captured:
        callable_()
    assert captured.value.code == "INDEX_REPAIR_REQUIRED"


def test_empty_nonpersistent_startup_hydrates_without_generation_increment(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "empty.sqlite"
    first_index = TrackingVectorIndex(persistent=False)
    first = _service(db_path, first_index)
    try:
        first_state = first.index_version()
        assert first_index.replace_calls == 1
        assert first_index.upsert_calls == 0
        assert first_state.generation == 0
        assert first_state.documentCount == 0
        assert first_state.chunkCount == 0
    finally:
        first.close()

    second_index = TrackingVectorIndex(persistent=False)
    second = _service(db_path, second_index)
    try:
        second_state = second.index_version()
        assert second_index.replace_calls == 1
        assert second_state.generation == 0
        assert second_state.indexVersion == first_state.indexVersion
    finally:
        second.close()


def test_healthy_persistent_verify_startup_is_read_only(tmp_path: Path) -> None:
    db_path = tmp_path / "healthy.sqlite"
    index = TrackingVectorIndex(persistent=True)
    _, expected_ids, seeded_state = _seed_healthy(db_path, index)

    service = _service(db_path, index, startup_policy="verify")
    try:
        observed = service.index_version()
        assert observed == seeded_state
        assert index.replace_calls == 0
        assert index.upsert_calls == 0
        assert index.contains_ids(expected_ids) == expected_ids
    finally:
        service.close()


def test_pending_journal_verify_rejects_and_repair_consumes_same_generation(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "pending.sqlite"
    registry = CorpusRegistry(str(db_path))
    try:
        pending = registry.create_repair_journal(_target())
    finally:
        registry.close()

    index = TrackingVectorIndex(persistent=True)
    _assert_repair_required(
        lambda: _service(db_path, index, startup_policy="verify")
    )
    assert index.replace_calls == 0

    repaired = _service(db_path, index, startup_policy="repair")
    try:
        state = repaired.index_version()
        assert index.replace_calls == 1
        assert state.generation == pending.target_generation
    finally:
        repaired.close()
    registry = CorpusRegistry(str(db_path))
    try:
        assert registry.read_index_sync_journal() is None
    finally:
        registry.close()


@pytest.mark.parametrize("drift", ["missing", "extra", "corrupt"])
def test_persistent_drift_requires_repair_and_consumes_one_generation(
    tmp_path: Path,
    drift: str,
) -> None:
    db_path = tmp_path / f"{drift}.sqlite"
    index = TrackingVectorIndex(persistent=True)
    _, expected_ids, seeded_state = _seed_healthy(db_path, index)
    expected_id = next(iter(expected_ids))
    if drift == "missing":
        index._vectors.pop(expected_id)
    elif drift == "extra":
        index._vectors[999] = np.zeros(_DIMENSION, dtype=np.float32)
    else:
        index._vectors[expected_id] = np.ones(_DIMENSION, dtype=np.float32)

    _assert_repair_required(
        lambda: _service(db_path, index, startup_policy="verify")
    )
    assert index.replace_calls == 0

    repaired = _service(db_path, index, startup_policy="repair")
    try:
        repaired_state = repaired.index_version()
        assert index.replace_calls == 1
        assert repaired_state.generation == seeded_state.generation + 1
        assert repaired_state.indexVersion == seeded_state.indexVersion
        assert index.count() == len(expected_ids)
        assert index.contains_ids(expected_ids | {999}) == expected_ids
    finally:
        repaired.close()


def test_invalid_sqlite_authority_fails_before_index_replacement(tmp_path: Path) -> None:
    db_path = tmp_path / "invalid-authority.sqlite"
    index = TrackingVectorIndex(persistent=True)
    _seed_healthy(db_path, index)
    registry = CorpusRegistry(str(db_path))
    try:
        registry._conn.execute(
            "UPDATE embeddings SET vector = ?",
            (np.zeros(1, dtype="<f4").tobytes(),),
        )
        registry._conn.commit()
    finally:
        registry.close()

    _assert_repair_required(
        lambda: _service(db_path, index, startup_policy="repair")
    )
    assert index.replace_calls == 0
    registry = CorpusRegistry(str(db_path))
    try:
        assert registry.read_index_sync_journal() is None
    finally:
        registry.close()


@pytest.mark.parametrize("startup_policy", ["verify", "repair"])
def test_embedding_identity_mismatch_is_not_repaired(
    tmp_path: Path,
    startup_policy: str,
) -> None:
    db_path = tmp_path / "embedding-mismatch.sqlite"
    index = TrackingVectorIndex(persistent=True)
    _seed_healthy(db_path, index)

    incompatible = NamedEmbeddingProvider(model_id="different-embedding-v1")
    _assert_repair_required(
        lambda: _service(
            db_path,
            index,
            startup_policy=startup_policy,
            embedding=incompatible,
        )
    )
    assert index.replace_calls == 0


@pytest.mark.parametrize("change", ["reranker", "bit_width"])
def test_allowed_config_change_requires_offline_repair(
    tmp_path: Path,
    change: str,
) -> None:
    db_path = tmp_path / f"config-{change}.sqlite"
    index = TrackingVectorIndex(persistent=True)
    _, _, seeded_state = _seed_healthy(db_path, index)
    reranker = NamedReranker("different-reranker-v1") if change == "reranker" else NamedReranker()
    bit_width = 3 if change == "bit_width" else 4

    _assert_repair_required(
        lambda: _service(
            db_path,
            index,
            startup_policy="verify",
            reranker=reranker,
            bit_width=bit_width,
        )
    )
    repaired = _service(
        db_path,
        index,
        startup_policy="repair",
        reranker=reranker,
        bit_width=bit_width,
    )
    try:
        repaired_state = repaired.index_version()
        assert repaired_state.generation == seeded_state.generation + 1
        assert repaired_state.indexVersion != seeded_state.indexVersion
        assert repaired_state.rerankerModel == reranker.model_id
    finally:
        repaired.close()


@pytest.mark.parametrize("fail_phase", ["before", "after"])
def test_failed_ingest_keeps_journal_blocks_instance_and_retries_same_generation(
    tmp_path: Path,
    fail_phase: str,
) -> None:
    db_path = tmp_path / f"failure-{fail_phase}.sqlite"
    index = TrackingVectorIndex(persistent=True)
    service = _service(db_path, index, startup_policy="verify")
    request = _request()
    try:
        assert service.index_version().generation == 0
        index.reset_calls()
        index.fail_phase = fail_phase
        _assert_repair_required(lambda: service.ingest(request))

        registry = CorpusRegistry(str(db_path))
        try:
            pending = registry.read_index_sync_journal()
            assert pending is not None
            assert registry.read_index_state().generation == 0
        finally:
            registry.close()

        _assert_repair_required(service.index_version)
        _assert_repair_required(lambda: service.search(_search()))
        _assert_repair_required(lambda: service.ingest(request))
    finally:
        service.close()

    index.reset_calls()
    repaired = _service(db_path, index, startup_policy="repair")
    try:
        repaired_state = repaired.index_version()
        assert index.replace_calls == 1
        assert repaired_state.generation == pending.target_generation
        assert repaired_state.documentCount == 1
        assert repaired_state.chunkCount == 1
    finally:
        repaired.close()
    registry = CorpusRegistry(str(db_path))
    try:
        assert registry.read_index_sync_journal() is None
    finally:
        registry.close()


def test_healthy_http_replay_is_read_only_and_preserves_chunk_order(tmp_path: Path) -> None:
    db_path = tmp_path / "replay.sqlite"
    index = TrackingVectorIndex(persistent=False)
    service = _service(db_path, index)
    request = _request(chunk_count=2)
    try:
        first = service.ingest(request)
        state_before = service.index_version()
        index.reset_calls()

        replay = service.ingest(request)
        state_after = service.index_version()

        assert replay.chunkIds == first.chunkIds
        assert index.replace_calls == 0
        assert index.upsert_calls == 0
        assert state_after.generation == state_before.generation
        assert state_after.indexVersion == state_before.indexVersion
    finally:
        service.close()


def test_request_hash_participates_in_corpus_and_index_versions(tmp_path: Path) -> None:
    states = []
    for name, title in (("first", "Título A"), ("second", "Título B")):
        index = TrackingVectorIndex(persistent=False)
        service = _service(tmp_path / f"{name}.sqlite", index)
        try:
            service.ingest(_request(title=title))
            states.append(service.index_version())
        finally:
            service.close()

    assert states[0].corpusIndexVersion != states[1].corpusIndexVersion
    assert states[0].indexVersion != states[1].indexVersion
