from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from historical_corpus.ingest_models import PreparedDocument
from historical_corpus.models import PageRecord, PageSummary
from historical_corpus.registry import CorpusRegistry


_FIXTURE_PATH = Path(__file__).with_name("prepared-document.json")
_SECOND_PAGE_ID = "sha256:" + "a" * 64
_SECOND_LINE_ID = "sha256:" + "b" * 64


def _prepared_document() -> PreparedDocument:
    return PreparedDocument.model_validate(json.loads(_FIXTURE_PATH.read_text(encoding="utf-8")))


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _table_count(registry: CorpusRegistry, table: str) -> int:
    return registry._conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def test_prepared_document_round_trips_every_persisted_field(tmp_path: Path) -> None:
    prepared = _prepared_document()
    metadata = prepared.metadata
    gate = prepared.publicationGate
    coverage = gate.coverage
    page = prepared.pages[0]
    line = page.lines[0]
    chunk = prepared.chunks[0]
    vector = b"\x01\x02\x03"
    registry = CorpusRegistry(str(tmp_path / "corpus.sqlite"))
    try:
        assert registry.atomically_insert_prepared_document(
            prepared,
            {chunk.chunkId: vector},
        ) == [chunk.chunkId]

        document_row = dict(
            registry._conn.execute(
                "SELECT * FROM documents WHERE document_id = ?",
                (metadata.documentId,),
            ).fetchone()
        )
        created_at = document_row.pop("created_at")
        assert created_at
        assert document_row == {
            "document_id": metadata.documentId,
            "source_url": metadata.sourceUrl,
            "title": metadata.title,
            "author": metadata.author,
            "edition": metadata.edition,
            "publication_year": metadata.publicationYear,
            "language": metadata.language,
            "country_code": metadata.countryCode,
            "source_class": metadata.sourceClass,
            "content_hash": metadata.contentHash,
            "request_hash": prepared.preparedDocumentHash,
            "rights_status": metadata.rights.status,
            "rights_uri": metadata.rights.uri,
            "rights_verified_at": metadata.rights.verifiedAt,
            "rights_is_explicitly_reusable": int(metadata.rights.isExplicitlyReusable),
            "work_id": metadata.workId,
            "volume_number": metadata.volumeNumber,
            "repository_name": metadata.repositoryName,
            "historical_period": metadata.historicalPeriod,
            "temporal_scope": metadata.temporalScope,
            "attribution": metadata.attribution,
            "source_is_exact_record": int(gate.sourceIsExactRecord),
            "canonical_pdf_relative_path": prepared.canonicalPdfRelativePath,
            "canonical_pdf_sha256": metadata.canonicalPdfSha256,
            "processing_fingerprint": prepared.processingFingerprint,
            "page_inventory_sha256": prepared.pageInventorySha256,
            "inventory_verified_at": prepared.inventoryVerifiedAt.isoformat(),
            "coverage_status": coverage.status,
            "coverage_statement": coverage.statement,
            "observed_printed_ranges_json": _canonical_json(
                [item.model_dump(mode="json") for item in coverage.observedPrintedRanges]
            ),
            "missing_printed_pages_json": _canonical_json(coverage.missingPrintedPages),
            "coverage_accepted_for_product": int(coverage.acceptedForProduct),
            "coverage_accepted_at": None,
        }

        stored_document = registry.get_document(metadata.documentId)
        assert stored_document is not None
        assert stored_document.model_dump(mode="json") == {
            "documentId": metadata.documentId,
            "sourceUrl": metadata.sourceUrl,
            "title": metadata.title,
            "author": metadata.author,
            "edition": metadata.edition,
            "publicationYear": metadata.publicationYear,
            "language": metadata.language,
            "countryCode": metadata.countryCode,
            "sourceClass": metadata.sourceClass,
            "contentHash": metadata.contentHash,
            "rightsStatus": metadata.rights.status,
            "rightsUri": metadata.rights.uri,
            "rightsVerifiedAt": metadata.rights.verifiedAt,
            "rightsIsExplicitlyReusable": metadata.rights.isExplicitlyReusable,
            "workId": metadata.workId,
            "volumeNumber": metadata.volumeNumber,
            "repositoryName": metadata.repositoryName,
            "historicalPeriod": metadata.historicalPeriod,
            "temporalScope": metadata.temporalScope,
            "attribution": metadata.attribution,
            "sourceIsExactRecord": gate.sourceIsExactRecord,
            "canonicalPdfSha256": metadata.canonicalPdfSha256,
            "processingFingerprint": prepared.processingFingerprint,
            "pageInventorySha256": prepared.pageInventorySha256,
            "inventoryVerifiedAt": prepared.inventoryVerifiedAt.isoformat(),
            "coverageStatus": coverage.status,
            "coverageStatement": coverage.statement,
            "coverageAcceptedForProduct": coverage.acceptedForProduct,
            "coverageAcceptedAt": None,
            "observedPrintedRanges": [
                item.model_dump(mode="json") for item in coverage.observedPrintedRanges
            ],
            "missingPrintedPages": coverage.missingPrintedPages,
        }

        page_row = dict(
            registry._conn.execute(
                "SELECT * FROM source_pages WHERE page_id = ?", (page.pageId,)
            ).fetchone()
        )
        assert page_row == {
            "page_id": page.pageId,
            "document_id": metadata.documentId,
            "logical_page_number": page.logicalPageNumber,
            "source_pdf_page_number": page.sourcePdfPageNumber,
            "leaf_side": page.leafSide,
            "continuity_break_before": int(page.continuityBreakBefore),
            "crop_box_json": _canonical_json(page.cropBox.model_dump(mode="json")),
            "printed_page_label": page.printedPageLabel,
            "width_px": page.widthPx,
            "height_px": page.heightPx,
            "render_dpi": page.renderDpi,
            "rasterization_policy": page.rasterizationPolicy,
            "rotation_degrees": page.rotationDegrees,
            "image_sha256": page.imageSha256,
            "content_class": page.contentClass,
            "foreground_ratio": page.foregroundRatio,
            "text_source": page.textSource,
            "ocr_engine": page.ocrEngine,
            "ocr_engine_version": page.ocrEngineVersion,
            "ocr_detection_model": page.ocrDetectionModel,
            "ocr_recognition_model": page.ocrRecognitionModel,
            "mean_confidence": page.meanConfidence,
            "low_confidence_ratio": page.lowConfidenceRatio,
            "quality_score": page.qualityScore,
            "quality_flags_json": _canonical_json(page.qualityFlags),
            "original_text": page.originalText,
            "processing_fingerprint": prepared.processingFingerprint,
        }
        line_row = dict(
            registry._conn.execute(
                "SELECT * FROM source_lines WHERE line_id = ?", (line.lineId,)
            ).fetchone()
        )
        assert line_row == {
            "line_id": line.lineId,
            "page_id": page.pageId,
            "line_order": line.lineOrder,
            "original_text": line.originalText,
            "confidence": line.confidence,
            "x0": line.box.x0,
            "y0": line.box.y0,
            "x1": line.box.x1,
            "y1": line.box.y1,
            "orientation_degrees": line.orientationDegrees,
            "role": line.role,
        }

        chunk_row = registry._conn.execute(
            "SELECT entry_title, chunk_order FROM chunks WHERE chunk_id = ?",
            (chunk.chunkId,),
        ).fetchone()
        assert tuple(chunk_row) == (chunk.entryTitle, 0)
        assert registry._conn.execute(
            "SELECT vector FROM embeddings WHERE chunk_id = ?", (chunk.chunkId,)
        ).fetchone()[0] == vector
        stored_chunk = registry.get_chunk(chunk.chunkId)
        assert stored_chunk is not None
        assert stored_chunk.entryTitle == chunk.entryTitle
        assert stored_chunk.lineIds == chunk.lineIds
        vector_id = registry._conn.execute(
            "SELECT vector_id FROM chunks WHERE chunk_id = ?", (chunk.chunkId,)
        ).fetchone()[0]
        assert registry.get_chunks_by_vector_ids([vector_id])[0].lineIds == chunk.lineIds

        summaries = registry.get_pages_for_document(metadata.documentId)
        assert len(summaries) == 1
        assert isinstance(summaries[0], PageSummary)
        assert summaries[0].pageId == page.pageId
        assert summaries[0].workId == metadata.workId
        assert summaries[0].canonicalPdfSha256 == metadata.canonicalPdfSha256
        assert summaries[0].rightsIsExplicitlyReusable is metadata.rights.isExplicitlyReusable
        assert [item.model_dump(mode="json") for item in summaries[0].observedPrintedRanges] == [
            item.model_dump(mode="json") for item in coverage.observedPrintedRanges
        ]
        assert summaries[0].missingPrintedPages == coverage.missingPrintedPages
        stored_page = registry.get_page(page.pageId)
        assert isinstance(stored_page, PageRecord)
        assert stored_page.cropBox == page.cropBox
        assert stored_page.qualityFlags == page.qualityFlags
        assert [item.lineId for item in stored_page.lines] == [line.lineId]
        assert stored_page.lines[0].model_dump(mode="json") == {
            "lineId": line.lineId,
            "lineOrder": line.lineOrder,
            "originalText": line.originalText,
            "confidence": line.confidence,
            "box": line.box.model_dump(mode="json"),
            "orientationDegrees": line.orientationDegrees,
            "role": line.role,
        }
        assert registry.get_canonical_pdf_relative_path(metadata.documentId) == (
            prepared.canonicalPdfRelativePath
        )
        assert registry.get_canonical_pdf_relative_path("missing") is None

        registry._conn.execute(
            "UPDATE source_pages SET logical_page_number = 2 WHERE page_id = ?",
            (page.pageId,),
        )
        registry._conn.execute(
            """
            INSERT INTO source_pages
            SELECT ?, document_id, 1, source_pdf_page_number, leaf_side,
                   continuity_break_before, crop_box_json, '31', width_px, height_px,
                   render_dpi, rasterization_policy, rotation_degrees, image_sha256,
                   content_class, foreground_ratio, text_source, ocr_engine,
                   ocr_engine_version, ocr_detection_model, ocr_recognition_model,
                   mean_confidence, low_confidence_ratio, quality_score,
                   quality_flags_json, original_text, processing_fingerprint
            FROM source_pages WHERE page_id = ?
            """,
            (_SECOND_PAGE_ID, page.pageId),
        )
        assert [item.pageId for item in registry.get_pages_for_document(metadata.documentId)] == [
            _SECOND_PAGE_ID,
            page.pageId,
        ]

        registry._conn.execute(
            "UPDATE source_lines SET line_order = 1 WHERE line_id = ?", (line.lineId,)
        )
        registry._conn.execute(
            """
            INSERT INTO source_lines
            (line_id, page_id, line_order, original_text, confidence,
             x0, y0, x1, y1, orientation_degrees, role)
            VALUES (?, ?, 0, 'Encabezado', 0.99, 0.1, 0.1, 0.9, 0.2, 0, 'header')
            """,
            (_SECOND_LINE_ID, page.pageId),
        )
        ordered_page = registry.get_page(page.pageId)
        assert ordered_page is not None
        assert [item.lineId for item in ordered_page.lines] == [_SECOND_LINE_ID, line.lineId]
    finally:
        registry.close()


def test_prepared_document_insert_rolls_back_every_table_on_conflict(tmp_path: Path) -> None:
    prepared = _prepared_document()
    chunk_id = prepared.chunks[0].chunkId
    registry = CorpusRegistry(str(tmp_path / "rollback.sqlite"))
    try:
        registry._conn.execute(
            """
            CREATE TRIGGER fail_prepared_chunk
            BEFORE INSERT ON chunks
            BEGIN
                SELECT RAISE(ABORT, 'injected chunk conflict');
            END
            """
        )
        with pytest.raises(sqlite3.IntegrityError, match="injected chunk conflict"):
            registry.atomically_insert_prepared_document(prepared, {chunk_id: b"vector"})

        for table in (
            "documents",
            "source_pages",
            "source_lines",
            "chunks",
            "chunk_lines",
            "embeddings",
            "chunk_city_qids",
            "chunk_entity_qids",
            "chunks_fts",
        ):
            assert _table_count(registry, table) == 0
    finally:
        registry.close()


def test_existing_prepared_document_is_reported_as_a_conflict(tmp_path: Path) -> None:
    prepared = _prepared_document()
    chunk_id = prepared.chunks[0].chunkId
    registry = CorpusRegistry(str(tmp_path / "conflict.sqlite"))
    try:
        registry.atomically_insert_prepared_document(prepared, {chunk_id: b"first"})
        before = {
            table: _table_count(registry, table)
            for table in ("documents", "source_pages", "source_lines", "chunks", "chunk_lines")
        }
        with pytest.raises(sqlite3.IntegrityError):
            registry.atomically_insert_prepared_document(prepared, {chunk_id: b"second"})
        assert {
            table: _table_count(registry, table)
            for table in ("documents", "source_pages", "source_lines", "chunks", "chunk_lines")
        } == before
        assert registry._conn.execute(
            "SELECT vector FROM embeddings WHERE chunk_id = ?", (chunk_id,)
        ).fetchone()[0] == b"first"
    finally:
        registry.close()
