from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from typing import Any, Sequence

from historical_corpus.identity import compute_chunk_id as _compute_chunk_id
from historical_corpus.models import (
    ChunkInput,
    ChunkRecord,
    DocumentRecord,
    IngestRequest,
    IndexVersion,
    SearchRequest,
)

_SCHEMA_VERSION = "2"
_CHUNKING_POLICY_VERSION = "1"
_SOURCE_REGISTRY_VERSION = "2"

_FTS_TOKEN_RE = re.compile(r"[^\w]+", re.UNICODE)


def _compute_text_hash(original_text: str) -> str:
    return "sha256:" + hashlib.sha256(original_text.encode("utf-8")).hexdigest()


def _compute_request_hash(request: IngestRequest) -> str:
    data = request.model_dump(mode="json")
    for field in (
        "workId",
        "volumeNumber",
        "repositoryName",
        "historicalPeriod",
        "temporalScope",
        "attribution",
        "sourceIsExactRecord",
        "canonicalPdfSha256",
        "processingFingerprint",
        "pageInventorySha256",
        "coverageStatus",
        "coverageStatement",
        "coverageAcceptedForProduct",
        "coverageAcceptedAt",
    ):
        if data.get(field) is None:
            data.pop(field, None)
    for field in ("observedPrintedRanges", "missingPrintedPages"):
        if not data.get(field):
            data.pop(field, None)
    for chunk in data.get("chunks", []):
        if chunk.get("entryTitle") is None:
            chunk.pop("entryTitle", None)
    payload = json.dumps(
        data,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _compute_vector_id(chunk_id: str) -> int:
    digest = hashlib.sha256(chunk_id.encode("utf-8")).digest()
    value = int.from_bytes(digest[:8], "big")
    return value & 0x7FFFFFFFFFFFFFFF


def _fts_quote(term: str) -> str:
    tokens = _FTS_TOKEN_RE.split(term)
    quoted = []
    for t in tokens:
        if not t:
            continue
        escaped = t.replace('"', '""')
        quoted.append(f'"{escaped}"')
    return " OR ".join(quoted)


class CorpusRegistry:
    def __init__(self, db_path: str) -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._conn.execute("PRAGMA busy_timeout = 5000")
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        statements = [
            "CREATE TABLE IF NOT EXISTS documents (\n                document_id TEXT PRIMARY KEY,\n                source_url TEXT NOT NULL,\n                title TEXT NOT NULL,\n                author TEXT NOT NULL,\n                edition TEXT NOT NULL,\n                publication_year INTEGER NOT NULL,\n                language TEXT NOT NULL,\n                country_code TEXT NOT NULL,\n                source_class TEXT NOT NULL,\n                content_hash TEXT NOT NULL,\n                request_hash TEXT NOT NULL,\n                rights_status TEXT NOT NULL,\n                rights_uri TEXT NOT NULL,\n                rights_verified_at TEXT NOT NULL,\n                rights_is_explicitly_reusable INTEGER NOT NULL,\n                created_at TEXT NOT NULL\n            )",
            "CREATE TABLE IF NOT EXISTS chunks (\n                chunk_id TEXT PRIMARY KEY,\n                vector_id INTEGER NOT NULL UNIQUE,\n                document_id TEXT NOT NULL REFERENCES documents(document_id),\n                original_text TEXT NOT NULL,\n                corrected_text TEXT,\n                page_start INTEGER NOT NULL,\n                page_end INTEGER NOT NULL,\n                section_path TEXT NOT NULL,\n                historical_period TEXT NOT NULL,\n                ocr_confidence REAL NOT NULL,\n                text_hash TEXT NOT NULL\n            )",
            "CREATE TABLE IF NOT EXISTS chunk_city_qids (\n                chunk_id TEXT NOT NULL REFERENCES chunks(chunk_id),\n                city_qid TEXT NOT NULL,\n                PRIMARY KEY (chunk_id, city_qid)\n            )",
            "CREATE TABLE IF NOT EXISTS chunk_entity_qids (\n                chunk_id TEXT NOT NULL REFERENCES chunks(chunk_id),\n                entity_qid TEXT NOT NULL,\n                PRIMARY KEY (chunk_id, entity_qid)\n            )",
            "CREATE TABLE IF NOT EXISTS embeddings (\n                chunk_id TEXT PRIMARY KEY REFERENCES chunks(chunk_id),\n                vector_id INTEGER NOT NULL UNIQUE,\n                vector BLOB NOT NULL\n            )",
            "CREATE TABLE IF NOT EXISTS index_state (\n                id INTEGER PRIMARY KEY CHECK (id = 1),\n                generation INTEGER NOT NULL,\n                index_version TEXT NOT NULL,\n                corpus_index_version TEXT NOT NULL,\n                embedding_model TEXT NOT NULL,\n                embedding_dimension INTEGER NOT NULL,\n                reranker_model TEXT NOT NULL,\n                chunking_policy_version TEXT NOT NULL,\n                source_registry_version TEXT NOT NULL,\n                document_count INTEGER NOT NULL,\n                chunk_count INTEGER NOT NULL,\n                updated_at TEXT NOT NULL\n            )",
            "CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(\n                chunk_id UNINDEXED,\n                vector_id UNINDEXED,\n                document_id UNINDEXED,\n                searchable_text,\n                section_path UNINDEXED,\n                city_qid UNINDEXED,\n                entity_qid UNINDEXED,\n                language UNINDEXED,\n                source_class UNINDEXED,\n                rights_status UNINDEXED,\n                publication_year UNINDEXED,\n                historical_period UNINDEXED,\n                ocr_confidence UNINDEXED\n            )",
        ]
        try:
            self._conn.execute("BEGIN IMMEDIATE")
            for sql in statements:
                self._execute_migration_statement(sql)
            self._ensure_column("documents", "work_id", "TEXT")
            self._ensure_column("documents", "volume_number", "INTEGER")
            self._ensure_column("documents", "repository_name", "TEXT")
            self._ensure_column("documents", "historical_period", "TEXT")
            self._ensure_column("documents", "temporal_scope", "TEXT")
            self._ensure_column("documents", "attribution", "TEXT")
            self._ensure_column("documents", "source_is_exact_record", "INTEGER")
            self._ensure_column("documents", "canonical_pdf_relative_path", "TEXT")
            self._ensure_column("documents", "canonical_pdf_sha256", "TEXT")
            self._ensure_column("documents", "processing_fingerprint", "TEXT")
            self._ensure_column("documents", "page_inventory_sha256", "TEXT")
            self._ensure_column("documents", "inventory_verified_at", "TEXT")
            self._ensure_column("documents", "coverage_status", "TEXT")
            self._ensure_column("documents", "coverage_statement", "TEXT")
            self._ensure_column("documents", "observed_printed_ranges_json", "TEXT")
            self._ensure_column("documents", "missing_printed_pages_json", "TEXT")
            self._ensure_column("documents", "coverage_accepted_for_product", "INTEGER")
            self._ensure_column("documents", "coverage_accepted_at", "TEXT")
            self._ensure_column("chunks", "entry_title", "TEXT")
            self._ensure_column("chunks", "chunk_order", "INTEGER")
            self._ensure_column("index_state", "vector_index_backend", "TEXT")
            self._ensure_column("index_state", "vector_index_bit_width", "INTEGER")
            self._ensure_column("index_state", "authority_sha256", "TEXT")
            self._ensure_column("index_state", "artifact_sha256", "TEXT")
            self._execute_migration_statement(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_document_order ON chunks(document_id, chunk_order) WHERE chunk_order IS NOT NULL"
            )
            self._execute_migration_statement(
                "CREATE TABLE IF NOT EXISTS source_pages (\n                page_id TEXT PRIMARY KEY,\n                document_id TEXT NOT NULL,\n                logical_page_number INTEGER NOT NULL,\n                source_pdf_page_number INTEGER NOT NULL,\n                leaf_side TEXT NOT NULL,\n                continuity_break_before INTEGER NOT NULL,\n                crop_box_json TEXT NOT NULL,\n                printed_page_label TEXT,\n                width_px INTEGER NOT NULL,\n                height_px INTEGER NOT NULL,\n                render_dpi INTEGER NOT NULL,\n                rasterization_policy TEXT NOT NULL,\n                rotation_degrees INTEGER NOT NULL,\n                image_sha256 TEXT NOT NULL,\n                content_class TEXT NOT NULL,\n                foreground_ratio REAL NOT NULL,\n                text_source TEXT NOT NULL,\n                ocr_engine TEXT NOT NULL,\n                ocr_engine_version TEXT NOT NULL,\n                ocr_detection_model TEXT NOT NULL,\n                ocr_recognition_model TEXT NOT NULL,\n                mean_confidence REAL NOT NULL,\n                low_confidence_ratio REAL NOT NULL,\n                quality_score REAL NOT NULL,\n                quality_flags_json TEXT NOT NULL,\n                original_text TEXT NOT NULL,\n                processing_fingerprint TEXT NOT NULL,\n                UNIQUE(document_id, logical_page_number),\n                FOREIGN KEY(document_id) REFERENCES documents(document_id)\n            )"
            )
            self._execute_migration_statement(
                "CREATE TABLE IF NOT EXISTS source_lines (\n                line_id TEXT PRIMARY KEY,\n                page_id TEXT NOT NULL,\n                line_order INTEGER NOT NULL,\n                original_text TEXT NOT NULL,\n                confidence REAL NOT NULL,\n                x0 REAL NOT NULL,\n                y0 REAL NOT NULL,\n                x1 REAL NOT NULL,\n                y1 REAL NOT NULL,\n                orientation_degrees INTEGER,\n                role TEXT NOT NULL,\n                UNIQUE(page_id, line_order),\n                FOREIGN KEY(page_id) REFERENCES source_pages(page_id)\n            )"
            )
            self._execute_migration_statement(
                "CREATE TABLE IF NOT EXISTS chunk_lines (\n                chunk_id TEXT NOT NULL,\n                line_id TEXT NOT NULL,\n                chunk_line_order INTEGER NOT NULL,\n                PRIMARY KEY(chunk_id, line_id),\n                UNIQUE(chunk_id, chunk_line_order),\n                FOREIGN KEY(chunk_id) REFERENCES chunks(chunk_id),\n                FOREIGN KEY(line_id) REFERENCES source_lines(line_id)\n            )"
            )
            self._execute_migration_statement(
                "CREATE TABLE IF NOT EXISTS index_sync_journal (\n                id INTEGER PRIMARY KEY CHECK (id = 1),\n                operation TEXT NOT NULL CHECK (operation IN ('publish', 'http_ingest', 'repair')),\n                target_generation INTEGER NOT NULL,\n                target_index_version TEXT NOT NULL,\n                target_corpus_index_version TEXT NOT NULL,\n                target_authority_sha256 TEXT NOT NULL,\n                embedding_model TEXT NOT NULL,\n                embedding_dimension INTEGER NOT NULL,\n                reranker_model TEXT NOT NULL,\n                vector_index_backend TEXT NOT NULL,\n                vector_index_bit_width INTEGER NOT NULL,\n                chunking_policy_version TEXT NOT NULL,\n                source_registry_version TEXT NOT NULL,\n                document_count INTEGER NOT NULL,\n                chunk_count INTEGER NOT NULL,\n                created_at TEXT NOT NULL\n            )"
            )
            self._conn.execute("COMMIT")
        except Exception:
            self._conn.rollback()
            raise

    def _execute_migration_statement(self, sql: str) -> None:
        self._conn.execute(sql)

    def _ensure_column(self, table: str, column: str, declaration: str) -> None:
        rows = self._conn.execute(f"PRAGMA table_info({table})").fetchall()
        existing = {row[1] for row in rows}
        if column not in existing:
            self._execute_migration_statement(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")

    def close(self) -> None:
        self._conn.close()

    def inspect_document(self, document_id: str) -> tuple[str, str] | None:
        row = self._conn.execute(
            "SELECT content_hash, request_hash FROM documents WHERE document_id = ?",
            (document_id,),
        ).fetchone()
        if row is None:
            return None
        return (row["content_hash"], row["request_hash"])

    def atomically_insert_document(
        self,
        request: IngestRequest,
        embeddings: dict[str, bytes],
    ) -> list[str]:
        request_hash = _compute_request_hash(request)
        now = datetime.now(timezone.utc).isoformat()
        chunk_ids: list[str] = []
        with self._conn:
            self._conn.execute(
                """
                INSERT INTO documents (
                    document_id, source_url, title, author, edition,
                    publication_year, language, country_code, source_class,
                    content_hash, request_hash, rights_status, rights_uri,
                    rights_verified_at, rights_is_explicitly_reusable, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request.documentId,
                    request.sourceUrl,
                    request.title,
                    request.author,
                    request.edition,
                    request.publicationYear,
                    request.language,
                    request.countryCode,
                    request.sourceClass,
                    request.contentHash,
                    request_hash,
                    request.rights.status,
                    request.rights.uri,
                    request.rights.verifiedAt,
                    1 if request.rights.isExplicitlyReusable else 0,
                    now,
                ),
            )
            for chunk in request.chunks:
                chunk_id = _compute_chunk_id(
                    request.documentId,
                    chunk.pageStart,
                    chunk.pageEnd,
                    chunk.sectionPath,
                    chunk.originalText,
                )
                chunk_ids.append(chunk_id)
                vector_id = _compute_vector_id(chunk_id)
                text_hash = _compute_text_hash(chunk.originalText)
                section_json = json.dumps(chunk.sectionPath, ensure_ascii=False, separators=(",", ":"))
                self._conn.execute(
                    """
                    INSERT INTO chunks (
                        chunk_id, vector_id, document_id, original_text, corrected_text,
                        page_start, page_end, section_path, historical_period,
                        ocr_confidence, text_hash
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk_id,
                        vector_id,
                        request.documentId,
                        chunk.originalText,
                        chunk.correctedText,
                        chunk.pageStart,
                        chunk.pageEnd,
                        section_json,
                        chunk.historicalPeriod,
                        chunk.ocrConfidence,
                        text_hash,
                    ),
                )
                for qid in chunk.cityQids:
                    self._conn.execute(
                        "INSERT INTO chunk_city_qids (chunk_id, city_qid) VALUES (?, ?)",
                        (chunk_id, qid),
                    )
                for qid in chunk.entityQids:
                    self._conn.execute(
                        "INSERT INTO chunk_entity_qids (chunk_id, entity_qid) VALUES (?, ?)",
                        (chunk_id, qid),
                    )
                if chunk_id in embeddings:
                    self._conn.execute(
                        "INSERT INTO embeddings (chunk_id, vector_id, vector) VALUES (?, ?, ?)",
                        (chunk_id, vector_id, embeddings[chunk_id]),
                    )
                index_text = chunk.correctedText if chunk.correctedText else chunk.originalText
                self._conn.execute(
                    """
                    INSERT INTO chunks_fts (
                        chunk_id, vector_id, document_id, searchable_text,
                        section_path, city_qid, entity_qid, language,
                        source_class, rights_status, publication_year,
                        historical_period, ocr_confidence
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk_id,
                        vector_id,
                        request.documentId,
                        index_text,
                        section_json,
                        ",".join(chunk.cityQids),
                        ",".join(chunk.entityQids),
                        request.language,
                        request.sourceClass,
                        request.rights.status,
                        request.publicationYear,
                        chunk.historicalPeriod,
                        chunk.ocrConfidence,
                    ),
                )
        self._update_index_state()
        return chunk_ids

    def get_document(self, document_id: str) -> DocumentRecord | None:
        row = self._conn.execute(
            "SELECT * FROM documents WHERE document_id = ?",
            (document_id,),
        ).fetchone()
        if row is None:
            return None
        return DocumentRecord(
            documentId=row["document_id"],
            sourceUrl=row["source_url"],
            title=row["title"],
            author=row["author"],
            edition=row["edition"],
            publicationYear=row["publication_year"],
            language=row["language"],
            countryCode=row["country_code"],
            sourceClass=row["source_class"],
            contentHash=row["content_hash"],
            rightsStatus=row["rights_status"],
            rightsUri=row["rights_uri"],
            rightsVerifiedAt=row["rights_verified_at"],
            rightsIsExplicitlyReusable=bool(row["rights_is_explicitly_reusable"]),
        )

    def get_chunk(self, chunk_id: str) -> ChunkRecord | None:
        row = self._conn.execute(
            """
            SELECT c.*, d.source_url, d.title, d.content_hash, d.rights_status,
                   d.rights_uri, d.rights_verified_at,
                   d.publication_year, d.language, d.source_class
            FROM chunks c
            JOIN documents d ON c.document_id = d.document_id
            WHERE c.chunk_id = ?
            """,
            (chunk_id,),
        ).fetchone()
        if row is None:
            return None
        city_qids = [
            r["city_qid"]
            for r in self._conn.execute(
                "SELECT city_qid FROM chunk_city_qids WHERE chunk_id = ? ORDER BY city_qid",
                (chunk_id,),
            )
        ]
        entity_qids = [
            r["entity_qid"]
            for r in self._conn.execute(
                "SELECT entity_qid FROM chunk_entity_qids WHERE chunk_id = ? ORDER BY entity_qid",
                (chunk_id,),
            )
        ]
        section_path = json.loads(row["section_path"])
        return ChunkRecord(
            chunkId=row["chunk_id"],
            documentId=row["document_id"],
            originalText=row["original_text"],
            correctedText=row["corrected_text"],
            pageStart=row["page_start"],
            pageEnd=row["page_end"],
            sectionPath=section_path,
            cityQids=city_qids,
            entityQids=entity_qids,
            historicalPeriod=row["historical_period"],
            ocrConfidence=row["ocr_confidence"],
            language=row["language"],
            sourceClass=row["source_class"],
            rightsStatus=row["rights_status"],
            publicationYear=row["publication_year"],
            sourceUrl=row["source_url"],
            title=row["title"],
            textHash=row["text_hash"],
            contentHash=row["content_hash"],
            rightsUri=row["rights_uri"],
            rightsVerifiedAt=row["rights_verified_at"],
        )

    def get_filtered_candidate_ids(self, request: SearchRequest) -> set[int]:
        clauses: list[str] = []
        params: list[Any] = []
        if request.cityQid is not None:
            clauses.append("EXISTS (SELECT 1 FROM chunk_city_qids WHERE chunk_city_qids.chunk_id = chunks.chunk_id AND chunk_city_qids.city_qid = ?)")
            params.append(request.cityQid)
        if request.stopQid is not None:
            clauses.append("EXISTS (SELECT 1 FROM chunk_entity_qids WHERE chunk_entity_qids.chunk_id = chunks.chunk_id AND chunk_entity_qids.entity_qid = ?)")
            params.append(request.stopQid)
        if request.languages is not None:
            placeholders = ",".join("?" for _ in request.languages)
            clauses.append(f"documents.language IN ({placeholders})")
            params.extend(request.languages)
        if request.sourceClasses is not None:
            placeholders = ",".join("?" for _ in request.sourceClasses)
            clauses.append(f"documents.source_class IN ({placeholders})")
            params.extend(request.sourceClasses)
        if request.rightsStatuses is not None:
            placeholders = ",".join("?" for _ in request.rightsStatuses)
            clauses.append(f"documents.rights_status IN ({placeholders})")
            params.extend(request.rightsStatuses)
        if request.documentIds is not None:
            placeholders = ",".join("?" for _ in request.documentIds)
            clauses.append(f"documents.document_id IN ({placeholders})")
            params.extend(request.documentIds)
        if request.publicationYearFrom is not None:
            clauses.append("documents.publication_year >= ?")
            params.append(request.publicationYearFrom)
        if request.publicationYearTo is not None:
            clauses.append("documents.publication_year <= ?")
            params.append(request.publicationYearTo)
        if request.historicalPeriods is not None:
            placeholders = ",".join("?" for _ in request.historicalPeriods)
            clauses.append(f"chunks.historical_period IN ({placeholders})")
            params.extend(request.historicalPeriods)
        if request.minOcrConfidence is not None:
            clauses.append("chunks.ocr_confidence >= ?")
            params.append(request.minOcrConfidence)
        where = " AND ".join(clauses) if clauses else "TRUE"
        rows = self._conn.execute(
            f"SELECT chunks.vector_id FROM chunks JOIN documents ON chunks.document_id = documents.document_id WHERE {where}",
            params,
        ).fetchall()
        return {row["vector_id"] for row in rows}

    def fts_search(self, query: str, allowed_vector_ids: set[int], limit: int) -> list[tuple[int, float]]:
        if not allowed_vector_ids:
            return []
        fts_query = _fts_quote(query)
        if not fts_query:
            return []
        placeholders = ",".join("?" for _ in allowed_vector_ids)
        rows = self._conn.execute(
            f"""
            SELECT vector_id, bm25(chunks_fts) AS score
            FROM chunks_fts
            WHERE chunks_fts MATCH ? AND vector_id IN ({placeholders})
            ORDER BY score ASC
            LIMIT ?
            """,
            (fts_query, *allowed_vector_ids, limit),
        ).fetchall()
        return [(row["vector_id"], row["score"]) for row in rows]

    def get_chunks_by_vector_ids(self, vector_ids: list[int]) -> list[ChunkRecord]:
        if not vector_ids:
            return []
        placeholders = ",".join("?" for _ in vector_ids)
        rows = self._conn.execute(
            f"""
            SELECT c.*, d.source_url, d.title, d.content_hash, d.rights_status,
                   d.rights_uri, d.rights_verified_at,
                   d.publication_year, d.language, d.source_class
            FROM chunks c
            JOIN documents d ON c.document_id = d.document_id
            WHERE c.vector_id IN ({placeholders})
            """,
            vector_ids,
        ).fetchall()
        records: list[ChunkRecord] = []
        for row in rows:
            city_qids = [
                r["city_qid"]
                for r in self._conn.execute(
                    "SELECT city_qid FROM chunk_city_qids WHERE chunk_id = ? ORDER BY city_qid",
                    (row["chunk_id"],),
                )
            ]
            entity_qids = [
                r["entity_qid"]
                for r in self._conn.execute(
                    "SELECT entity_qid FROM chunk_entity_qids WHERE chunk_id = ? ORDER BY entity_qid",
                    (row["chunk_id"],),
                )
            ]
            section_path = json.loads(row["section_path"])
            records.append(
                ChunkRecord(
                    chunkId=row["chunk_id"],
                    documentId=row["document_id"],
                    originalText=row["original_text"],
                    correctedText=row["corrected_text"],
                    pageStart=row["page_start"],
                    pageEnd=row["page_end"],
                    sectionPath=section_path,
                    cityQids=city_qids,
                    entityQids=entity_qids,
                    historicalPeriod=row["historical_period"],
                    ocrConfidence=row["ocr_confidence"],
                    language=row["language"],
                    sourceClass=row["source_class"],
                    rightsStatus=row["rights_status"],
                    publicationYear=row["publication_year"],
                    sourceUrl=row["source_url"],
                    title=row["title"],
                    textHash=row["text_hash"],
                    contentHash=row["content_hash"],
                    rightsUri=row["rights_uri"],
                    rightsVerifiedAt=row["rights_verified_at"],
                )
            )
        return records

    def load_all_embeddings(self) -> dict[int, bytes]:
        rows = self._conn.execute("SELECT vector_id, vector FROM embeddings").fetchall()
        return {row["vector_id"]: row["vector"] for row in rows}

    def load_embeddings(self, chunk_ids: list[str]) -> dict[str, bytes]:
        if not chunk_ids:
            return {}
        placeholders = ",".join("?" for _ in chunk_ids)
        rows = self._conn.execute(
            f"SELECT chunk_id, vector FROM embeddings WHERE chunk_id IN ({placeholders})",
            chunk_ids,
        ).fetchall()
        return {r["chunk_id"]: r["vector"] for r in rows}

    def get_chunk_ids_for_document(self, document_id: str) -> list[str]:
        rows = self._conn.execute(
            "SELECT chunk_id FROM chunks WHERE document_id = ? ORDER BY page_start, page_end, chunk_id",
            (document_id,),
        ).fetchall()
        return [row["chunk_id"] for row in rows]

    def get_vector_ids_for_chunk_ids(self, chunk_ids: list[str]) -> dict[str, int]:
        if not chunk_ids:
            return {}
        placeholders = ",".join("?" for _ in chunk_ids)
        rows = self._conn.execute(
            f"SELECT chunk_id, vector_id FROM chunks WHERE chunk_id IN ({placeholders})",
            chunk_ids,
        ).fetchall()
        return {row["chunk_id"]: row["vector_id"] for row in rows}

    def count_documents(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]

    def count_chunks(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]

    def read_index_state(self) -> IndexVersion | None:
        row = self._conn.execute("SELECT * FROM index_state WHERE id = 1").fetchone()
        if row is None:
            return None
        return IndexVersion(
            generation=row["generation"],
            indexVersion=row["index_version"],
            corpusIndexVersion=row["corpus_index_version"],
            embeddingModel=row["embedding_model"],
            embeddingDimension=row["embedding_dimension"],
            rerankerModel=row["reranker_model"],
            chunkingPolicyVersion=row["chunking_policy_version"],
            sourceRegistryVersion=row["source_registry_version"],
            documentCount=row["document_count"],
            chunkCount=row["chunk_count"],
        )

    def _compute_corpus_index_version(self) -> str:
        rows = self._conn.execute(
            "SELECT document_id, content_hash FROM documents ORDER BY document_id"
        ).fetchall()
        pairs = [f"{row['document_id']}|{row['content_hash']}" for row in rows]
        payload = "\n".join(pairs)
        return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def mark_index_state(
        self,
        embedding_model: str,
        embedding_dimension: int,
        reranker_model: str,
    ) -> None:
        doc_count = self.count_documents()
        chunk_count = self.count_chunks()
        generation = 1
        existing = self._conn.execute("SELECT generation FROM index_state WHERE id = 1").fetchone()
        if existing is not None:
            generation = existing["generation"] + 1
        corpus_index_version = self._compute_corpus_index_version()
        index_version = "sha256:" + hashlib.sha256(
            f"{corpus_index_version}|{embedding_model}|{embedding_dimension}|{reranker_model}|{_CHUNKING_POLICY_VERSION}|{_SOURCE_REGISTRY_VERSION}".encode("utf-8")
        ).hexdigest()
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """
            INSERT INTO index_state (
                id, generation, index_version, corpus_index_version,
                embedding_model, embedding_dimension, reranker_model,
                chunking_policy_version, source_registry_version,
                document_count, chunk_count, updated_at
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                generation = excluded.generation,
                index_version = excluded.index_version,
                corpus_index_version = excluded.corpus_index_version,
                embedding_model = excluded.embedding_model,
                embedding_dimension = excluded.embedding_dimension,
                reranker_model = excluded.reranker_model,
                chunking_policy_version = excluded.chunking_policy_version,
                source_registry_version = excluded.source_registry_version,
                document_count = excluded.document_count,
                chunk_count = excluded.chunk_count,
                updated_at = excluded.updated_at
            """,
            (
                generation,
                index_version,
                corpus_index_version,
                embedding_model,
                embedding_dimension,
                reranker_model,
                _CHUNKING_POLICY_VERSION,
                _SOURCE_REGISTRY_VERSION,
                doc_count,
                chunk_count,
                now,
            ),
        )
        self._conn.commit()

    def _update_index_state(self) -> None:
        row = self._conn.execute("SELECT * FROM index_state WHERE id = 1").fetchone()
        if row is None:
            return
        doc_count = self.count_documents()
        chunk_count = self.count_chunks()
        self._conn.execute(
            """
            UPDATE index_state
            SET document_count = ?, chunk_count = ?, updated_at = ?
            WHERE id = 1
            """,
            (doc_count, chunk_count, datetime.now(timezone.utc).isoformat()),
        )
        self._conn.commit()
