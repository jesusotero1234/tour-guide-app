from __future__ import annotations

import hashlib
import json
import sqlite3
import struct
from pathlib import Path
from typing import Callable

import pytest

from historical_corpus.identity import canonical_json_bytes
from historical_corpus.ingest_models import PreparedDocument
from historical_corpus.registry import (
    CorpusRegistry,
    IndexAuthority,
    IndexSyncJournal,
    IndexTargetConfig,
)


_FIXTURE_PATH = Path(__file__).with_name("prepared-document.json")
_ARTIFACT_SHA256 = "sha256:" + "a" * 64


def _prepared_document() -> PreparedDocument:
    return PreparedDocument.model_validate(json.loads(_FIXTURE_PATH.read_text(encoding="utf-8")))


def _target() -> IndexTargetConfig:
    return IndexTargetConfig(
        embedding_model="test-embedding-v1",
        embedding_dimension=2,
        reranker_model="test-reranker-v1",
        vector_index_backend="turbovec",
        vector_index_bit_width=4,
    )


def _hash_canonical(value: object) -> str:
    return "sha256:" + hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def _valid_insert(registry: CorpusRegistry) -> tuple[PreparedDocument, bytes, int]:
    prepared = _prepared_document()
    chunk_id = prepared.chunks[0].chunkId
    blob = struct.pack("<2f", 0.25, -0.5)
    registry.atomically_insert_prepared_document(
        prepared,
        {chunk_id: blob},
        target=_target(),
    )
    vector_id = registry._conn.execute(
        "SELECT vector_id FROM chunks WHERE chunk_id = ?", (chunk_id,)
    ).fetchone()[0]
    return prepared, blob, vector_id


def _authority_hash(vector_id: int, blob: bytes) -> str:
    payload = struct.pack(">Q", vector_id) + struct.pack(">Q", len(blob)) + blob
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def test_prepared_insert_commits_corpus_and_exact_target_journal_together(tmp_path: Path) -> None:
    registry = CorpusRegistry(str(tmp_path / "journal.sqlite"))
    try:
        prepared, blob, vector_id = _valid_insert(registry)
        metadata = prepared.metadata
        target = _target()
        corpus_version = _hash_canonical(
            [
                {
                    "documentId": metadata.documentId,
                    "contentHash": metadata.contentHash,
                    "requestHash": prepared.preparedDocumentHash,
                }
            ]
        )
        index_version = _hash_canonical(
            {
                "corpusIndexVersion": corpus_version,
                "embeddingModel": target.embedding_model,
                "embeddingDimension": target.embedding_dimension,
                "rerankerModel": target.reranker_model,
                "vectorIndexBackend": target.vector_index_backend,
                "vectorIndexBitWidth": target.vector_index_bit_width,
                "chunkingPolicyVersion": target.chunking_policy_version,
                "sourceRegistryVersion": target.source_registry_version,
            }
        )
        expected_authority = _authority_hash(vector_id, blob)

        journal = registry.read_index_sync_journal()
        assert isinstance(journal, IndexSyncJournal)
        assert journal.operation == "publish"
        assert journal.target_generation == 1
        assert journal.target_corpus_index_version == corpus_version
        assert journal.target_index_version == index_version
        assert journal.target_authority_sha256 == expected_authority
        assert journal.embedding_model == target.embedding_model
        assert journal.embedding_dimension == target.embedding_dimension
        assert journal.reranker_model == target.reranker_model
        assert journal.vector_index_backend == "turbovec"
        assert journal.vector_index_bit_width == 4
        assert journal.chunking_policy_version == target.chunking_policy_version
        assert journal.source_registry_version == target.source_registry_version
        assert journal.document_count == 1
        assert journal.chunk_count == 1
        assert registry.read_index_state() is None

        authority = registry.load_embedding_authority(target)
        assert isinstance(authority, IndexAuthority)
        assert authority.vector_ids == (vector_id,)
        assert authority.vector_blobs == (blob,)
        assert authority.authority_sha256 == expected_authority
        assert authority.document_count == 1
        assert authority.chunk_count == 1
    finally:
        registry.close()


def test_existing_journal_rejects_new_insert_before_any_data_changes(tmp_path: Path) -> None:
    registry = CorpusRegistry(str(tmp_path / "busy.sqlite"))
    try:
        first = registry.create_repair_journal(_target())
        assert first.operation == "repair"
        prepared = _prepared_document()
        chunk_id = prepared.chunks[0].chunkId

        with pytest.raises(RuntimeError, match="journal"):
            registry.atomically_insert_prepared_document(
                prepared,
                {chunk_id: struct.pack("<2f", 0.0, 1.0)},
                target=_target(),
            )

        assert registry.count_documents() == 0
        assert registry.count_chunks() == 0
        assert registry.read_index_sync_journal() == first
    finally:
        registry.close()


def test_journal_insert_failure_rolls_back_the_entire_prepared_document(tmp_path: Path) -> None:
    registry = CorpusRegistry(str(tmp_path / "rollback.sqlite"))
    try:
        registry._conn.execute(
            """
            CREATE TRIGGER fail_journal
            BEFORE INSERT ON index_sync_journal
            BEGIN
                SELECT RAISE(ABORT, 'injected journal failure');
            END
            """
        )
        registry._conn.commit()
        prepared = _prepared_document()
        chunk_id = prepared.chunks[0].chunkId

        with pytest.raises(sqlite3.IntegrityError, match="injected journal failure"):
            registry.atomically_insert_prepared_document(
                prepared,
                {chunk_id: struct.pack("<2f", 0.0, 1.0)},
                target=_target(),
            )

        for table in (
            "documents",
            "source_pages",
            "source_lines",
            "chunks",
            "chunk_lines",
            "embeddings",
            "chunks_fts",
            "index_sync_journal",
        ):
            assert registry._conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0
    finally:
        registry.close()


def _delete_embedding(registry: CorpusRegistry, _: str, __: int) -> None:
    registry._conn.execute("DELETE FROM embeddings")


def _insert_orphan_embedding(registry: CorpusRegistry, _: str, vector_id: int) -> None:
    registry._conn.commit()
    registry._conn.execute("PRAGMA foreign_keys = OFF")
    registry._conn.execute(
        "INSERT INTO embeddings (chunk_id, vector_id, vector) VALUES (?, ?, ?)",
        ("sha256:" + "c" * 64, vector_id + 1, struct.pack("<2f", 1.0, 2.0)),
    )


def _mismatch_embedding_id(registry: CorpusRegistry, _: str, vector_id: int) -> None:
    registry._conn.execute("UPDATE embeddings SET vector_id = ?", (vector_id + 1,))


def _truncate_embedding(registry: CorpusRegistry, _: str, __: int) -> None:
    registry._conn.execute("UPDATE embeddings SET vector = ?", (struct.pack("<f", 1.0),))


def _make_embedding_non_finite(registry: CorpusRegistry, _: str, __: int) -> None:
    registry._conn.execute("UPDATE embeddings SET vector = ?", (struct.pack("<2f", float("inf"), 1.0),))


def _tamper_chunk_vector_id(registry: CorpusRegistry, _: str, vector_id: int) -> None:
    registry._conn.execute("UPDATE chunks SET vector_id = ?", (vector_id + 1,))


@pytest.mark.parametrize(
    "corrupt",
    [
        _delete_embedding,
        _insert_orphan_embedding,
        _mismatch_embedding_id,
        _truncate_embedding,
        _make_embedding_non_finite,
        _tamper_chunk_vector_id,
    ],
)
def test_embedding_authority_rejects_missing_or_corrupt_rows(
    tmp_path: Path,
    corrupt: Callable[[CorpusRegistry, str, int], None],
) -> None:
    registry = CorpusRegistry(str(tmp_path / f"{corrupt.__name__}.sqlite"))
    try:
        prepared, _, vector_id = _valid_insert(registry)
        corrupt(registry, prepared.chunks[0].chunkId, vector_id)
        registry._conn.commit()
        with pytest.raises(ValueError):
            registry.load_embedding_authority(_target())
    finally:
        registry.close()


def test_repair_journal_survives_restart_and_finalizes_exact_state(tmp_path: Path) -> None:
    db_path = tmp_path / "repair.sqlite"
    registry = CorpusRegistry(str(db_path))
    journal = registry.create_repair_journal(_target())
    assert journal.target_generation == 1
    registry.close()

    reopened = CorpusRegistry(str(db_path))
    try:
        pending = reopened.read_index_sync_journal()
        assert pending == journal
        state = reopened.finalize_index_sync(pending, _ARTIFACT_SHA256)
        assert state.generation == 1
        assert state.indexVersion == journal.target_index_version
        assert reopened.read_index_sync_journal() is None
        row = reopened._conn.execute("SELECT * FROM index_state WHERE id = 1").fetchone()
        assert row["generation"] == journal.target_generation
        assert row["corpus_index_version"] == journal.target_corpus_index_version
        assert row["authority_sha256"] == journal.target_authority_sha256
        assert row["artifact_sha256"] == _ARTIFACT_SHA256
        assert row["vector_index_backend"] == "turbovec"
        assert row["vector_index_bit_width"] == 4
        assert row["document_count"] == 0
        assert row["chunk_count"] == 0
    finally:
        reopened.close()


def test_tampered_target_cannot_finalize_or_consume_journal(tmp_path: Path) -> None:
    registry = CorpusRegistry(str(tmp_path / "tampered.sqlite"))
    try:
        registry.create_repair_journal(_target())
        registry._conn.execute(
            "UPDATE index_sync_journal SET chunk_count = 1 WHERE id = 1"
        )
        registry._conn.commit()
        tampered = registry.read_index_sync_journal()

        with pytest.raises(ValueError, match="target"):
            registry.finalize_index_sync(tampered, _ARTIFACT_SHA256)

        assert registry.read_index_state() is None
        assert registry.read_index_sync_journal() == tampered
    finally:
        registry.close()


def test_empty_index_state_is_generation_zero_and_idempotent(tmp_path: Path) -> None:
    registry = CorpusRegistry(str(tmp_path / "empty.sqlite"))
    try:
        first = registry.ensure_empty_index_state(_target(), _ARTIFACT_SHA256)
        second = registry.ensure_empty_index_state(_target(), _ARTIFACT_SHA256)
        assert first == second
        assert first.generation == 0
        assert first.documentCount == 0
        assert first.chunkCount == 0
        assert registry.read_index_sync_journal() is None
        row = registry._conn.execute("SELECT * FROM index_state WHERE id = 1").fetchone()
        assert row["authority_sha256"] == "sha256:" + hashlib.sha256(b"").hexdigest()
        assert row["artifact_sha256"] == _ARTIFACT_SHA256
    finally:
        registry.close()


@pytest.mark.parametrize(
    "field",
    ["reranker_model", "chunking_policy_version", "source_registry_version"],
)
def test_index_target_config_rejects_empty_fields(field: str) -> None:
    kwargs = {
        "embedding_model": "test-embedding-v1",
        "embedding_dimension": 2,
        "reranker_model": "test-reranker-v1",
        "vector_index_backend": "turbovec",
        "vector_index_bit_width": 4,
    }
    kwargs[field] = ""
    with pytest.raises(ValueError):
        IndexTargetConfig(**kwargs)


def test_ensure_empty_index_state_rejects_malformed_artifact_sha256(tmp_path: Path) -> None:
    registry = CorpusRegistry(str(tmp_path / "bad-artifact.sqlite"))
    try:
        with pytest.raises(ValueError):
            registry.ensure_empty_index_state(_target(), "not-a-sha256")
        assert registry.read_index_state() is None
    finally:
        registry.close()


def test_ensure_empty_index_state_idempotent_rejects_different_artifact(tmp_path: Path) -> None:
    registry = CorpusRegistry(str(tmp_path / "mismatch-artifact.sqlite"))
    try:
        first = registry.ensure_empty_index_state(_target(), _ARTIFACT_SHA256)
        with pytest.raises(ValueError):
            registry.ensure_empty_index_state(_target(), "sha256:" + "b" * 64)
        row = registry._conn.execute("SELECT * FROM index_state WHERE id = 1").fetchone()
        assert row["artifact_sha256"] == _ARTIFACT_SHA256
        assert row["generation"] == first.generation
    finally:
        registry.close()


def test_ensure_empty_index_state_rejects_orphan_embedding(tmp_path: Path) -> None:
    registry = CorpusRegistry(str(tmp_path / "orphan.sqlite"))
    try:
        registry._conn.execute("PRAGMA foreign_keys = OFF")
        registry._conn.execute(
            "INSERT INTO embeddings (chunk_id, vector_id, vector) VALUES (?, ?, ?)",
            ("sha256:" + "c" * 64, 1, struct.pack("<2f", 1.0, 2.0)),
        )
        registry._conn.commit()
        with pytest.raises(ValueError):
            registry.ensure_empty_index_state(_target(), _ARTIFACT_SHA256)
        assert registry.read_index_state() is None
    finally:
        registry.close()


def test_finalize_retry_after_index_state_insert_failure(tmp_path: Path) -> None:
    registry = CorpusRegistry(str(tmp_path / "retry.sqlite"))
    try:
        journal = registry.create_repair_journal(_target())
        assert journal.target_generation == 1

        registry._conn.execute(
            """
            CREATE TRIGGER block_index_state
            BEFORE INSERT ON index_state
            BEGIN
                SELECT RAISE(ABORT, 'injected index_state failure');
            END
            """
        )
        registry._conn.commit()

        with pytest.raises(sqlite3.IntegrityError, match="injected index_state failure"):
            registry.finalize_index_sync(journal, _ARTIFACT_SHA256)

        assert registry.read_index_sync_journal() == journal
        assert registry.read_index_state() is None

        registry._conn.execute("DROP TRIGGER block_index_state")
        registry._conn.commit()

        state = registry.finalize_index_sync(journal, _ARTIFACT_SHA256)
        assert state.generation == journal.target_generation
        assert registry.read_index_sync_journal() is None
    finally:
        registry.close()
