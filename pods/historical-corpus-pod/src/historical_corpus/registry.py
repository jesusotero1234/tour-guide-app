from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from typing import Any, Sequence

from historical_corpus.models import (
    ChunkInput,
    ChunkRecord,
    DocumentRecord,
    IngestRequest,
    IndexVersion,
    SearchRequest,
)

_SCHEMA_VERSION = "1"
_CHUNKING_POLICY_VERSION = "1"
_SOURCE_REGISTRY_VERSION = "1"

_FTS_TOKEN_RE = re.compile(r"[^\w]+", re.UNICODE)


def _compute_text_hash(original_text: str) -> str:
    return "sha256:" + hashlib.sha256(original_text.encode("utf-8")).hexdigest()


def _compute_chunk_id(
    document_id: str,
    page_start: int,
    page_end: int,
    section_path: list[str],
    original_text: str,
) -> str:
    section_json = json.dumps(section_path, ensure_ascii=False, separators=(",", ":"))
    payload = f"{document_id}|{page_start}|{page_end}|{section_json}|{original_text}"
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _compute_request_hash(request: IngestRequest) -> str:
    payload = json.dumps(
        request.model_dump(mode="json"),
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
    return " ".join(quoted)


class CorpusRegistry:
    def __init__(self, db_path: str) -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._conn.execute("PRAGMA busy_timeout = 5000")
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS documents (
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
            CREATE TABLE IF NOT EXISTS chunks (
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
            CREATE TABLE IF NOT EXISTS chunk_city_qids (
                chunk_id TEXT NOT NULL REFERENCES chunks(chunk_id),
                city_qid TEXT NOT NULL,
                PRIMARY KEY (chunk_id, city_qid)
            );
            CREATE TABLE IF NOT EXISTS chunk_entity_qids (
                chunk_id TEXT NOT NULL REFERENCES chunks(chunk_id),
                entity_qid TEXT NOT NULL,
                PRIMARY KEY (chunk_id, entity_qid)
            );
            CREATE TABLE IF NOT EXISTS embeddings (
                chunk_id TEXT PRIMARY KEY REFERENCES chunks(chunk_id),
                vector_id INTEGER NOT NULL UNIQUE,
                vector BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS index_state (
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
            CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
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
        )
        self._conn.commit()

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
