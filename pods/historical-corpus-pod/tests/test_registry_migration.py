from __future__ import annotations

import json
from pathlib import Path
import sqlite3

import pytest

import historical_corpus.registry as registry_module
from historical_corpus.identity import compute_chunk_id
from historical_corpus.models import IngestRequest, SearchRequest
from historical_corpus.registry import CorpusRegistry


V1_DDL = """
CREATE TABLE documents (
    document_id TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    edition TEXT NOT NULL,
    publication_year INTEGER NOT NULL,
    language TEXT NOT NULL,
    country_code TEXT NOT NULL,
    source_class TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    rights_status TEXT NOT NULL,
    rights_uri TEXT NOT NULL,
    rights_verified_at TEXT NOT NULL,
    rights_is_explicitly_reusable INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE chunks (
    chunk_id TEXT PRIMARY KEY,
    vector_id INTEGER NOT NULL UNIQUE,
    document_id TEXT NOT NULL REFERENCES documents(document_id),
    original_text TEXT NOT NULL,
    corrected_text TEXT,
    page_start INTEGER NOT NULL,
    page_end INTEGER NOT NULL,
    section_path TEXT NOT NULL,
    historical_period TEXT NOT NULL,
    ocr_confidence REAL NOT NULL,
    text_hash TEXT NOT NULL
);
CREATE TABLE chunk_city_qids (
    chunk_id TEXT NOT NULL REFERENCES chunks(chunk_id),
    city_qid TEXT NOT NULL,
    PRIMARY KEY (chunk_id, city_qid)
);
CREATE TABLE chunk_entity_qids (
    chunk_id TEXT NOT NULL REFERENCES chunks(chunk_id),
    entity_qid TEXT NOT NULL,
    PRIMARY KEY (chunk_id, entity_qid)
);
CREATE TABLE embeddings (
    chunk_id TEXT PRIMARY KEY REFERENCES chunks(chunk_id),
    vector_id INTEGER NOT NULL UNIQUE,
    vector BLOB NOT NULL
);
CREATE TABLE index_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    generation INTEGER NOT NULL,
    index_version TEXT NOT NULL,
    corpus_index_version TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    embedding_dimension INTEGER NOT NULL,
    reranker_model TEXT NOT NULL,
    chunking_policy_version TEXT NOT NULL,
    source_registry_version TEXT NOT NULL,
    document_count INTEGER NOT NULL,
    chunk_count INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE chunks_fts USING fts5(
    chunk_id UNINDEXED,
    vector_id UNINDEXED,
    document_id UNINDEXED,
    searchable_text,
    section_path UNINDEXED,
    city_qid UNINDEXED,
    entity_qid UNINDEXED,
    language UNINDEXED,
    source_class UNINDEXED,
    rights_status UNINDEXED,
    publication_year UNINDEXED,
    historical_period UNINDEXED,
    ocr_confidence UNINDEXED
);
"""


DOCUMENT_V2_COLUMNS = {
    "work_id",
    "volume_number",
    "repository_name",
    "historical_period",
    "temporal_scope",
    "attribution",
    "source_is_exact_record",
    "canonical_pdf_relative_path",
    "canonical_pdf_sha256",
    "processing_fingerprint",
    "page_inventory_sha256",
    "inventory_verified_at",
    "coverage_status",
    "coverage_statement",
    "observed_printed_ranges_json",
    "missing_printed_pages_json",
    "coverage_accepted_for_product",
    "coverage_accepted_at",
}
INDEX_STATE_V2_COLUMNS = {
    "vector_index_backend",
    "vector_index_bit_width",
    "authority_sha256",
    "artifact_sha256",
}
V2_TABLES = {"source_pages", "source_lines", "chunk_lines", "index_sync_journal"}


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}


def _tables(connection: sqlite3.Connection) -> set[str]:
    return {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type IN ('table','view')"
        )
    }


def _create_seeded_v1(path: Path) -> tuple[str, int]:
    connection = sqlite3.connect(path)
    connection.executescript(V1_DDL)
    document_id = "legacy-madoz"
    original_text = "MÁLAGA: ciudad histórica y puerto mediterráneo."
    section_path = ["Diccionario", "Málaga"]
    chunk_id = compute_chunk_id(document_id, 32, 32, section_path, original_text)
    vector_id = registry_module._compute_vector_id(chunk_id)
    connection.execute(
        """
        INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            document_id,
            "https://example.test/legacy.pdf",
            "Legacy Madoz",
            "Pascual Madoz",
            "Tomo XI",
            1848,
            "es",
            "ES",
            "primary_historical",
            "sha256:" + "0" * 64,
            "sha256:" + "1" * 64,
            "public-domain",
            "https://example.test/rights",
            "2026-09-02T20:00:00+02:00",
            1,
            "2026-09-02T20:00:00+02:00",
        ),
    )
    connection.execute(
        "INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            chunk_id,
            vector_id,
            document_id,
            original_text,
            None,
            32,
            32,
            json.dumps(section_path, ensure_ascii=False, separators=(",", ":")),
            "1848",
            0.9,
            "sha256:" + "2" * 64,
        ),
    )
    connection.execute("INSERT INTO chunk_city_qids VALUES (?, ?)", (chunk_id, "Q8851"))
    connection.execute("INSERT INTO embeddings VALUES (?, ?, ?)", (chunk_id, vector_id, b"legacy"))
    connection.execute(
        "INSERT INTO chunks_fts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            chunk_id,
            vector_id,
            document_id,
            original_text,
            json.dumps(section_path, ensure_ascii=False, separators=(",", ":")),
            "Q8851",
            "",
            "es",
            "primary_historical",
            "public-domain",
            1848,
            "1848",
            0.9,
        ),
    )
    connection.commit()
    connection.close()
    return chunk_id, vector_id


def test_legacy_request_and_chunk_hashes_are_frozen() -> None:
    example_path = Path(__file__).parents[1] / "examples" / "malaga-smoke-ingest.json"
    request = IngestRequest.model_validate_json(example_path.read_text(encoding="utf-8"))
    assert registry_module._compute_request_hash(request) == (
        "sha256:042430c597e0336df2ed73ff9869544ad88d46449bf6635b1a5a49bb63f6d74a"
    )
    assert registry_module._compute_chunk_id is compute_chunk_id


def test_v1_database_migrates_additively_and_remains_readable(tmp_path: Path) -> None:
    database = tmp_path / "corpus.sqlite"
    chunk_id, vector_id = _create_seeded_v1(database)

    registry = CorpusRegistry(str(database))
    try:
        assert registry.get_document("legacy-madoz") is not None
        assert registry.get_chunk(chunk_id) is not None
        assert registry.get_filtered_candidate_ids(
            SearchRequest(query="Málaga", documentIds=["legacy-madoz"])
        ) == {vector_id}
        assert registry.fts_search("Málaga", {vector_id}, 10)[0][0] == vector_id

        connection = registry._conn
        assert DOCUMENT_V2_COLUMNS <= _columns(connection, "documents")
        assert {"entry_title", "chunk_order"} <= _columns(connection, "chunks")
        assert INDEX_STATE_V2_COLUMNS <= _columns(connection, "index_state")
        assert V2_TABLES <= _tables(connection)
        row = connection.execute("SELECT * FROM documents WHERE document_id='legacy-madoz'").fetchone()
        assert all(row[name] is None for name in DOCUMENT_V2_COLUMNS)
        chunk = connection.execute("SELECT * FROM chunks WHERE chunk_id=?", (chunk_id,)).fetchone()
        assert chunk["entry_title"] is None
        assert chunk["chunk_order"] is None
        index_sql = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_chunks_document_order'"
        ).fetchone()[0]
        assert "WHERE chunk_order IS NOT NULL" in index_sql
    finally:
        registry.close()


def test_migration_is_idempotent_and_fresh_database_is_v2(tmp_path: Path) -> None:
    migrated = tmp_path / "migrated.sqlite"
    _create_seeded_v1(migrated)
    for _ in range(2):
        registry = CorpusRegistry(str(migrated))
        assert registry.count_documents() == 1
        registry.close()

    fresh = CorpusRegistry(str(tmp_path / "fresh.sqlite"))
    try:
        assert DOCUMENT_V2_COLUMNS <= _columns(fresh._conn, "documents")
        assert V2_TABLES <= _tables(fresh._conn)
    finally:
        fresh.close()
    assert registry_module._SCHEMA_VERSION == "2"
    assert registry_module._SOURCE_REGISTRY_VERSION == "2"
    assert registry_module._CHUNKING_POLICY_VERSION == "1"


def test_v2_foreign_keys_uniques_and_journal_check_are_present(tmp_path: Path) -> None:
    registry = CorpusRegistry(str(tmp_path / "constraints.sqlite"))
    try:
        connection = registry._conn
        page_fks = {row[2] for row in connection.execute("PRAGMA foreign_key_list(source_pages)")}
        line_fks = {row[2] for row in connection.execute("PRAGMA foreign_key_list(source_lines)")}
        join_fks = {row[2] for row in connection.execute("PRAGMA foreign_key_list(chunk_lines)")}
        assert page_fks == {"documents"}
        assert line_fks == {"source_pages"}
        assert join_fks == {"chunks", "source_lines"}
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO index_sync_journal VALUES
                (1,'invalid',1,'i','c','a','e',1,'r','t',4,'1','2',0,0,'now')
                """
            )
    finally:
        registry.close()


def test_failed_migration_rolls_back_every_statement(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database = tmp_path / "rollback.sqlite"
    _create_seeded_v1(database)
    original = CorpusRegistry._execute_migration_statement

    def fail_midway(self: CorpusRegistry, sql: str) -> None:
        if "ADD COLUMN repository_name" in sql:
            raise RuntimeError("injected migration failure")
        original(self, sql)

    monkeypatch.setattr(CorpusRegistry, "_execute_migration_statement", fail_midway)
    with pytest.raises(RuntimeError, match="injected migration failure"):
        CorpusRegistry(str(database))

    connection = sqlite3.connect(database)
    try:
        assert DOCUMENT_V2_COLUMNS.isdisjoint(_columns(connection, "documents"))
        assert V2_TABLES.isdisjoint(_tables(connection))
        assert connection.execute("SELECT COUNT(*) FROM documents").fetchone()[0] == 1
    finally:
        connection.close()
