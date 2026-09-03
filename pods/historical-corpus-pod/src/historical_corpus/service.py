from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path
from typing import Any, Literal

import numpy as np

from historical_corpus.backends import EmbeddingProvider, Reranker, VectorIndex
from historical_corpus.models import (
    ChunkRecord,
    DocumentRecord,
    IndexVersion,
    IngestRequest,
    IngestResult,
    SearchHit,
    SearchRequest,
    SearchResponse,
)
from historical_corpus.registry import (
    ComputedIndexTarget,
    CorpusRegistry,
    IndexStateSnapshot,
    IndexSyncJournal,
    IndexTargetConfig,
    _compute_chunk_id,
    _compute_request_hash,
)


class HistoricalCorpusError(Exception):
    code = "HISTORICAL_CORPUS_ERROR"

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class RightsNotReusableError(HistoricalCorpusError):
    code = "REUSE_RIGHTS_NOT_VERIFIED"


class DocumentConflictError(HistoricalCorpusError):
    code = "DOCUMENT_CONFLICT"


class RecordNotFoundError(HistoricalCorpusError):
    code = "NOT_FOUND"


class IndexRepairRequiredError(HistoricalCorpusError):
    code = "INDEX_REPAIR_REQUIRED"


class HistoricalCorpusService:
    def __init__(
        self,
        *,
        db_path: str | Path,
        vector_index: VectorIndex,
        embedding_provider: EmbeddingProvider,
        reranker: Reranker,
        startup_policy: Literal["verify", "repair"] = "verify",
        vector_index_backend: str = "turbovec",
        vector_index_bit_width: int = 4,
    ) -> None:
        if embedding_provider.dimension <= 0:
            raise ValueError("embedding dimension must be positive")
        if vector_index.dimension != embedding_provider.dimension:
            raise ValueError("vector index and embedding provider dimensions must match")
        if startup_policy not in ("verify", "repair"):
            raise ValueError("startup_policy must be verify or repair")

        target = IndexTargetConfig(
            embedding_model=embedding_provider.model_id,
            embedding_dimension=embedding_provider.dimension,
            reranker_model=reranker.model_id,
            vector_index_backend=vector_index_backend,
            vector_index_bit_width=vector_index_bit_width,
        )
        self._registry = CorpusRegistry(str(db_path))
        self._vector_index = vector_index
        self._embedding_provider = embedding_provider
        self._reranker = reranker
        self._target = target
        self._lock = threading.RLock()
        self._closed = False
        self._index_available = False

        try:
            self._initialize_index(startup_policy)
        except IndexRepairRequiredError:
            self._registry.close()
            self._closed = True
            raise
        except Exception as exc:
            self._registry.close()
            self._closed = True
            raise IndexRepairRequiredError(
                "the vector index must be repaired before use"
            ) from exc

    def _assert_open(self) -> None:
        if self._closed:
            raise RuntimeError("historical corpus service is closed")

    def _assert_index_available(self) -> None:
        if not self._index_available:
            raise IndexRepairRequiredError(
                "the vector index must be repaired before use"
            )

    def _authority_matrix(self, computed: ComputedIndexTarget) -> np.ndarray:
        blobs = computed.authority.vector_blobs
        if not blobs:
            return np.empty((0, self._target.embedding_dimension), dtype=np.float32)
        return np.stack([self._decode_embedding(blob) for blob in blobs])

    def _vector_artifact_if_exact(self, computed: ComputedIndexTarget) -> str | None:
        expected_ids = set(computed.authority.vector_ids)
        try:
            if self._vector_index.count() != len(expected_ids):
                return None
            if self._vector_index.contains_ids(computed.authority.vector_ids) != expected_ids:
                return None
            return self._vector_index.artifact_sha256()
        except Exception:
            return None

    def _state_matches(
        self,
        snapshot: IndexStateSnapshot | None,
        computed: ComputedIndexTarget,
        artifact_sha256: str | None,
    ) -> bool:
        if snapshot is None or artifact_sha256 is None:
            return False
        state = snapshot.version
        return (
            state.indexVersion == computed.index_version
            and state.corpusIndexVersion == computed.corpus_index_version
            and state.embeddingModel == self._target.embedding_model
            and state.embeddingDimension == self._target.embedding_dimension
            and state.rerankerModel == self._target.reranker_model
            and state.chunkingPolicyVersion == self._target.chunking_policy_version
            and state.sourceRegistryVersion == self._target.source_registry_version
            and state.documentCount == computed.document_count
            and state.chunkCount == computed.chunk_count
            and snapshot.vector_index_backend == self._target.vector_index_backend
            and snapshot.vector_index_bit_width == self._target.vector_index_bit_width
            and snapshot.authority_sha256 == computed.authority_sha256
            and snapshot.artifact_sha256 == artifact_sha256
        )

    def _embedding_identity_is_incompatible(
        self,
        snapshot: IndexStateSnapshot | None,
        computed: ComputedIndexTarget,
    ) -> bool:
        if snapshot is None or computed.chunk_count == 0:
            return False
        state = snapshot.version
        return (
            state.embeddingModel != self._target.embedding_model
            or state.embeddingDimension != self._target.embedding_dimension
        )

    def _replace_from_authority(self, computed: ComputedIndexTarget) -> str:
        self._vector_index.replace_all(
            computed.authority.vector_ids,
            self._authority_matrix(computed),
        )
        artifact_sha256 = self._vector_artifact_if_exact(computed)
        if artifact_sha256 is None:
            raise ValueError("vector index replacement did not match SQLite authority")
        if not self._vector_index.is_persistent and artifact_sha256 != computed.authority_sha256:
            raise ValueError("nonpersistent artifact does not match SQLite authority")
        return artifact_sha256

    def _journal_matches_target(
        self,
        journal: IndexSyncJournal,
        computed: ComputedIndexTarget,
    ) -> bool:
        return (
            journal.target_index_version == computed.index_version
            and journal.target_corpus_index_version == computed.corpus_index_version
            and journal.target_authority_sha256 == computed.authority_sha256
            and journal.embedding_model == self._target.embedding_model
            and journal.embedding_dimension == self._target.embedding_dimension
            and journal.reranker_model == self._target.reranker_model
            and journal.vector_index_backend == self._target.vector_index_backend
            and journal.vector_index_bit_width == self._target.vector_index_bit_width
            and journal.chunking_policy_version == self._target.chunking_policy_version
            and journal.source_registry_version == self._target.source_registry_version
            and journal.document_count == computed.document_count
            and journal.chunk_count == computed.chunk_count
        )

    def _reconcile_journal(self, journal: IndexSyncJournal) -> IndexVersion:
        try:
            computed = self._registry.compute_index_target(self._target)
            if not self._journal_matches_target(journal, computed):
                raise ValueError("journal target no longer matches SQLite authority")
            artifact_sha256 = self._replace_from_authority(computed)
            return self._registry.finalize_index_sync(journal, artifact_sha256)
        except IndexRepairRequiredError:
            raise
        except Exception as exc:
            raise IndexRepairRequiredError(
                "the vector index must be repaired before use"
            ) from exc

    def _initialize_index(self, startup_policy: Literal["verify", "repair"]) -> None:
        try:
            computed = self._registry.compute_index_target(self._target)
        except Exception as exc:
            raise IndexRepairRequiredError(
                "SQLite embedding authority is invalid"
            ) from exc

        snapshot = self._registry.read_index_state_snapshot()
        if self._embedding_identity_is_incompatible(snapshot, computed):
            raise IndexRepairRequiredError(
                "stored embeddings do not match the configured embedding model"
            )

        journal = self._registry.read_index_sync_journal()
        if journal is not None:
            if startup_policy != "repair":
                raise IndexRepairRequiredError(
                    "an index synchronization journal is pending"
                )
            self._reconcile_journal(journal)
            self._index_available = True
            return

        if not self._vector_index.is_persistent:
            artifact_sha256 = self._replace_from_authority(computed)
            if snapshot is None and computed.document_count == 0 and computed.chunk_count == 0:
                self._registry.ensure_empty_index_state(self._target, artifact_sha256)
                snapshot = self._registry.read_index_state_snapshot()
            if self._state_matches(snapshot, computed, artifact_sha256):
                self._index_available = True
                return
            if startup_policy != "repair":
                raise IndexRepairRequiredError(
                    "the in-memory index state does not match SQLite authority"
                )
            repair_journal = self._registry.create_repair_journal(self._target)
            self._reconcile_journal(repair_journal)
            self._index_available = True
            return

        artifact_sha256 = self._vector_artifact_if_exact(computed)
        if snapshot is None and computed.document_count == 0 and computed.chunk_count == 0:
            if artifact_sha256 is not None:
                self._registry.ensure_empty_index_state(self._target, artifact_sha256)
                snapshot = self._registry.read_index_state_snapshot()
        if self._state_matches(snapshot, computed, artifact_sha256):
            self._index_available = True
            return
        if startup_policy != "repair":
            raise IndexRepairRequiredError(
                "the persistent index does not match SQLite authority"
            )
        repair_journal = self._registry.create_repair_journal(self._target)
        self._reconcile_journal(repair_journal)
        self._index_available = True

    def _decode_embedding(self, payload: bytes) -> np.ndarray:
        vector = np.frombuffer(payload, dtype="<f4").astype(np.float32)
        if vector.shape != (self._embedding_provider.dimension,):
            raise ValueError("stored embedding dimension does not match configuration")
        if not np.all(np.isfinite(vector)):
            raise ValueError("stored embedding contains non-finite values")
        return vector

    def ingest(self, request: IngestRequest) -> IngestResult:
        with self._lock:
            self._assert_open()
            self._assert_index_available()
            if not request.rights.isExplicitlyReusable:
                raise RightsNotReusableError(
                    "source reuse rights are not explicitly verified",
                    details={"documentId": request.documentId},
                )

            request_hash = _compute_request_hash(request)
            existing = self._registry.inspect_document(request.documentId)
            if existing is not None:
                content_hash, stored_request_hash = existing
                if content_hash != request.contentHash or stored_request_hash != request_hash:
                    raise DocumentConflictError(
                        "documentId is already bound to different content or metadata",
                        details={"documentId": request.documentId},
                    )
                chunk_ids = self._registry.get_chunk_ids_for_document(request.documentId)
                stored_embeddings = self._registry.load_embeddings(chunk_ids)
                vector_id_by_chunk = self._registry.get_vector_ids_for_chunk_ids(chunk_ids)
                missing = [
                    chunk_id
                    for chunk_id in chunk_ids
                    if chunk_id not in stored_embeddings or chunk_id not in vector_id_by_chunk
                ]
                if missing:
                    raise HistoricalCorpusError(
                        "stored embeddings or vector IDs are missing for replay",
                        details={"documentId": request.documentId, "missingChunkIds": missing},
                    )
                return IngestResult(documentId=request.documentId, chunkIds=chunk_ids)

            searchable_texts = [
                chunk.correctedText or chunk.originalText for chunk in request.chunks
            ]
            vectors = np.asarray(
                self._embedding_provider.embed_documents(searchable_texts),
                dtype=np.float32,
            )
            expected_shape = (len(request.chunks), self._embedding_provider.dimension)
            if vectors.shape != expected_shape:
                raise ValueError(f"embedding provider returned {vectors.shape}; expected {expected_shape}")
            if not np.all(np.isfinite(vectors)):
                raise ValueError("embedding provider returned non-finite values")

            chunk_ids = [
                _compute_chunk_id(
                    request.documentId,
                    chunk.pageStart,
                    chunk.pageEnd,
                    chunk.sectionPath,
                    chunk.originalText,
                )
                for chunk in request.chunks
            ]
            embedding_payloads = {
                chunk_id: np.asarray(vectors[index], dtype="<f4").tobytes(order="C")
                for index, chunk_id in enumerate(chunk_ids)
            }
            stored_chunk_ids = self._registry.atomically_insert_document(
                request,
                embedding_payloads,
                target=self._target,
            )
            journal = self._registry.read_index_sync_journal()
            if journal is None:
                self._index_available = False
                raise IndexRepairRequiredError(
                    "the committed corpus update has no synchronization journal"
                )
            try:
                self._reconcile_journal(journal)
            except IndexRepairRequiredError:
                self._index_available = False
                raise
            return IngestResult(documentId=request.documentId, chunkIds=stored_chunk_ids)

    def get_chunk(self, chunk_id: str) -> ChunkRecord:
        with self._lock:
            self._assert_open()
            record = self._registry.get_chunk(chunk_id)
            if record is None:
                raise RecordNotFoundError(
                    "chunk was not found",
                    details={"chunkId": chunk_id},
                )
            return record

    def get_document(self, document_id: str) -> DocumentRecord:
        with self._lock:
            self._assert_open()
            record = self._registry.get_document(document_id)
            if record is None:
                raise RecordNotFoundError(
                    "document was not found",
                    details={"documentId": document_id},
                )
            return record

    def index_version(self) -> IndexVersion:
        with self._lock:
            self._assert_open()
            self._assert_index_available()
            state = self._registry.read_index_state()
            if state is None:
                self._index_available = False
                raise IndexRepairRequiredError(
                    "index state is missing"
                )
            return state

    def search(self, request: SearchRequest) -> SearchResponse:
        with self._lock:
            self._assert_open()
            self._assert_index_available()
            query_hash = self._query_hash(request)
            state = self.index_version()
            allowed_ids = self._registry.get_filtered_candidate_ids(request)
            if not allowed_ids:
                return SearchResponse(
                    queryHash=query_hash,
                    indexVersion=state.indexVersion,
                    hits=[],
                )

            candidate_limit = min(len(allowed_ids), max(20, request.limit * 4))
            lexical_rows = self._registry.fts_search(
                request.query,
                allowed_ids,
                candidate_limit,
            )
            query_vectors = np.asarray(
                self._embedding_provider.embed_queries([request.query]),
                dtype=np.float32,
            )
            expected_shape = (1, self._embedding_provider.dimension)
            if query_vectors.shape != expected_shape or not np.all(np.isfinite(query_vectors)):
                raise ValueError("embedding provider returned an invalid query vector")
            dense_rows = self._vector_index.search(
                query_vectors[0],
                candidate_limit,
                allowed_ids,
            )

            lexical_strengths = {
                vector_id: abs(float(raw_score))
                for vector_id, raw_score in lexical_rows
            }
            max_lexical_strength = max(lexical_strengths.values(), default=0.0)
            lexical_scores = {
                vector_id: (
                    strength / max_lexical_strength
                    if max_lexical_strength > 0
                    else 0.0
                )
                for vector_id, strength in lexical_strengths.items()
            }
            dense_scores = {vector_id: float(score) for vector_id, score in dense_rows}
            fusion_scores: dict[int, float] = {}
            for rank, (vector_id, _) in enumerate(lexical_rows, start=1):
                fusion_scores[vector_id] = fusion_scores.get(vector_id, 0.0) + 1.0 / (60 + rank)
            for rank, (vector_id, _) in enumerate(dense_rows, start=1):
                fusion_scores[vector_id] = fusion_scores.get(vector_id, 0.0) + 1.0 / (60 + rank)

            fused_ids = sorted(
                fusion_scores,
                key=lambda vector_id: (-fusion_scores[vector_id], vector_id),
            )[:candidate_limit]
            records = self._registry.get_chunks_by_vector_ids(fused_ids)
            record_by_chunk = {record.chunkId: record for record in records}
            vector_id_by_chunk = self._registry.get_vector_ids_for_chunk_ids(
                list(record_by_chunk)
            )
            record_by_vector = {
                vector_id_by_chunk[chunk_id]: record
                for chunk_id, record in record_by_chunk.items()
            }
            ordered_records = [record_by_vector[vector_id] for vector_id in fused_ids]
            rerank_scores = self._reranker.rerank(
                request.query,
                [record.correctedText or record.originalText for record in ordered_records],
            )
            if len(rerank_scores) != len(ordered_records):
                raise ValueError("reranker returned an unexpected number of scores")

            hits: list[SearchHit] = []
            for vector_id, record, rerank_score in zip(
                fused_ids,
                ordered_records,
                rerank_scores,
                strict=True,
            ):
                matched_qids = (
                    [request.stopQid]
                    if request.stopQid is not None and request.stopQid in record.entityQids
                    else ([] if request.stopQid is not None else record.entityQids)
                )
                hits.append(
                    SearchHit(
                        chunkId=record.chunkId,
                        documentId=record.documentId,
                        pageStart=record.pageStart,
                        pageEnd=record.pageEnd,
                        textHash=record.textHash,
                        contentHash=record.contentHash,
                        sourceUrl=record.sourceUrl,
                        title=record.title,
                        rightsStatus=record.rightsStatus,
                        lexicalScore=lexical_scores.get(vector_id, 0.0),
                        denseScore=dense_scores.get(vector_id, 0.0),
                        fusionScore=fusion_scores.get(vector_id, 0.0),
                        rerankScore=float(rerank_score),
                        matchedEntityQids=matched_qids,
                        text=record.correctedText or record.originalText,
                        sectionPath=record.sectionPath,
                        cityQids=record.cityQids,
                        entityQids=record.entityQids,
                        language=record.language,
                        sourceClass=record.sourceClass,
                        publicationYear=record.publicationYear,
                        historicalPeriod=record.historicalPeriod,
                        ocrConfidence=record.ocrConfidence,
                        rightsUri=record.rightsUri,
                        rightsVerifiedAt=record.rightsVerifiedAt,
                    )
                )

            hits.sort(
                key=lambda hit: (
                    -hit.rerankScore,
                    -hit.fusionScore,
                    -hit.denseScore,
                    -hit.lexicalScore,
                    hit.chunkId,
                )
            )
            return SearchResponse(
                queryHash=query_hash,
                indexVersion=state.indexVersion,
                hits=hits[: request.limit],
            )

    @staticmethod
    def _query_hash(request: SearchRequest) -> str:
        payload = json.dumps(
            request.model_dump(mode="json"),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def close(self) -> None:
        with self._lock:
            if not self._closed:
                self._registry.close()
                self._closed = True

    def __enter__(self) -> "HistoricalCorpusService":
        self._assert_open()
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        self.close()
