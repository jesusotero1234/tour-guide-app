from __future__ import annotations

import json
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest

from historical_corpus import madoz_pipeline
from historical_corpus.ingest_models import PreparedDocument
from historical_corpus.staging import load_prepared_document, load_evaluation_sample
from historical_corpus.processing_fingerprint import CanonicalPdf


SHA_A = "sha256:" + "a" * 64
SHA_B = "sha256:" + "b" * 64
SHA_C = "sha256:" + "c" * 64


def _record(
    pdf_page: int,
    status: str,
    sequence: int | None,
    *,
    continuity_break: bool = False,
) -> SimpleNamespace:
    return SimpleNamespace(
        pdfPage=pdf_page,
        side="full",
        canonicalStatus=status,
        canonicalSequenceIndex=sequence,
        continuityBreakBefore=continuity_break,
    )


def _make_manifest(tmp_path: Path) -> SimpleNamespace:
    inventory_path = tmp_path / "inventory.jsonl"
    inventory_path.write_bytes(b"inventory")
    return SimpleNamespace(
        document=SimpleNamespace(documentId="madoz-11"),
        source=SimpleNamespace(expectedSha256="a" * 64),
        selection=SimpleNamespace(
            expectedPageInventorySha256="b" * 64,
            inventoryVerifiedAt="2026-09-03T10:00:00+00:00",
            candidatePdfPageRanges=(SimpleNamespace(start=10, end=12),),
            canonicalization=SimpleNamespace(),
            splitSpreads=False,
        ),
        processing=SimpleNamespace(modelLockFile="locks/ppocr.json"),
        coverage=SimpleNamespace(),
        prepare_allowed=True,
        publish_allowed=False,
    )


def _make_records() -> list[SimpleNamespace]:
    return [
        _record(12, "include", 2, continuity_break=True),
        _record(11, "exclude_nonbody", None),
        _record(10, "include", 1),
    ]


def _make_canonical_pdf(tmp_path: Path) -> SimpleNamespace:
    return SimpleNamespace(path=tmp_path / "raw.pdf", sha256=SHA_A)


def _make_fingerprint_payload() -> SimpleNamespace:
    return SimpleNamespace(selection=SimpleNamespace(canonicalization="snapshot"))


def _patch_common(
    monkeypatch,
    tmp_path: Path,
    manifest: SimpleNamespace,
    records: list[SimpleNamespace],
    canonical_pdf: SimpleNamespace,
    fingerprint_payload: SimpleNamespace,
    events: list[str],
    lock_active: list[bool],
) -> None:
    inventory_path = tmp_path / "inventory.jsonl"

    @contextmanager
    def fake_lock(path: Path):
        assert path == tmp_path / "data" / "locks" / "madoz-prepare.lock"
        events.append("lock-enter")
        lock_active[0] = True
        try:
            yield
        finally:
            events.append("lock-exit")
            lock_active[0] = False

    def fake_validate(loaded_manifest: object, imports_root: Path) -> SimpleNamespace:
        assert lock_active[0]
        assert loaded_manifest is manifest
        events.append("source-validated")
        return SimpleNamespace(
            inventory_path=inventory_path,
            inventory_sha256="b" * 64,
            pdf_sha256="a" * 64,
        )

    def fake_inventory(payload: bytes, loaded_manifest: object) -> list[SimpleNamespace]:
        assert lock_active[0]
        assert payload == b"inventory"
        assert loaded_manifest is manifest
        events.append("inventory-validated")
        return records

    def fake_prepare_source(*args: object) -> SimpleNamespace:
        assert lock_active[0]
        events.append("source-prepared")
        return canonical_pdf

    def fake_load_model_lock(*args: object) -> object:
        assert lock_active[0]
        events.append("model-lock-validated")
        return object()

    def fake_fingerprint(*args: object) -> tuple[object, str]:
        assert lock_active[0]
        events.append("fingerprint-built")
        return fingerprint_payload, SHA_C

    monkeypatch.setattr(madoz_pipeline, "load_manifest", lambda path: manifest)
    monkeypatch.setattr(madoz_pipeline, "exclusive_lock", fake_lock)
    monkeypatch.setattr(madoz_pipeline, "validate_manifest_source", fake_validate)
    monkeypatch.setattr(madoz_pipeline, "load_verified_inventory", fake_inventory)
    monkeypatch.setattr(madoz_pipeline, "prepare_source", fake_prepare_source)
    monkeypatch.setattr(madoz_pipeline, "load_model_lock", fake_load_model_lock)
    monkeypatch.setattr(madoz_pipeline, "build_processing_fingerprint", fake_fingerprint)
    monkeypatch.setattr(madoz_pipeline, "_build_metadata", lambda *a, **kw: object())


def test_prepare_document_locks_validates_and_processes_only_includes_in_order(
    tmp_path: Path,
    monkeypatch,
) -> None:
    events: list[str] = []
    lock_active = False
    inventory_path = tmp_path / "inventory.jsonl"
    inventory_path.write_bytes(b"inventory")
    manifest = SimpleNamespace(
        document=SimpleNamespace(documentId="madoz-11"),
        source=SimpleNamespace(expectedSha256="a" * 64),
        selection=SimpleNamespace(
            expectedPageInventorySha256="b" * 64,
            inventoryVerifiedAt="2026-09-03T10:00:00+00:00",
            candidatePdfPageRanges=(SimpleNamespace(start=10, end=12),),
            canonicalization=SimpleNamespace(),
        ),
        processing=SimpleNamespace(modelLockFile="locks/ppocr.json"),
        coverage=SimpleNamespace(),
        prepare_allowed=True,
        publish_allowed=False,
    )
    records = [
        _record(12, "include", 2, continuity_break=True),
        _record(11, "exclude_nonbody", None),
        _record(10, "include", 1),
    ]
    canonical_pdf = SimpleNamespace(path=tmp_path / "raw.pdf", sha256=SHA_A)
    fingerprint_payload = SimpleNamespace(selection=SimpleNamespace(canonicalization="snapshot"))
    processed_pages: list[SimpleNamespace] = []
    result_sentinel = object()

    monkeypatch.setattr(madoz_pipeline, "load_manifest", lambda path: manifest)

    @contextmanager
    def fake_lock(path: Path):
        nonlocal lock_active
        assert path == tmp_path / "data" / "locks" / "madoz-prepare.lock"
        events.append("lock-enter")
        lock_active = True
        try:
            yield
        finally:
            events.append("lock-exit")
            lock_active = False

    def fake_validate(loaded_manifest: object, imports_root: Path) -> SimpleNamespace:
        assert lock_active
        assert loaded_manifest is manifest
        events.append("source-validated")
        return SimpleNamespace(
            inventory_path=inventory_path,
            inventory_sha256="b" * 64,
            pdf_sha256="a" * 64,
        )

    def fake_inventory(payload: bytes, loaded_manifest: object) -> list[SimpleNamespace]:
        assert lock_active
        assert payload == b"inventory"
        assert loaded_manifest is manifest
        events.append("inventory-validated")
        return records

    def fake_prepare_source(*args: object) -> SimpleNamespace:
        assert lock_active
        events.append("source-prepared")
        return canonical_pdf

    def fake_load_model_lock(*args: object) -> object:
        assert lock_active
        events.append("model-lock-validated")
        return object()

    def fake_fingerprint(*args: object) -> tuple[object, str]:
        assert lock_active
        events.append("fingerprint-built")
        return fingerprint_payload, SHA_C

    monkeypatch.setattr(madoz_pipeline, "exclusive_lock", fake_lock)
    monkeypatch.setattr(madoz_pipeline, "validate_manifest_source", fake_validate)
    monkeypatch.setattr(madoz_pipeline, "load_verified_inventory", fake_inventory)
    monkeypatch.setattr(madoz_pipeline, "prepare_source", fake_prepare_source)
    monkeypatch.setattr(madoz_pipeline, "load_model_lock", fake_load_model_lock)
    monkeypatch.setattr(madoz_pipeline, "build_processing_fingerprint", fake_fingerprint)
    monkeypatch.setattr(madoz_pipeline, "load_reusable_staged_page", lambda *a, **kw: None)

    def fake_staged(page: SimpleNamespace, **kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(page=page)

    def fake_write_page(*args: object) -> Path:
        assert lock_active
        events.append("page-staged")
        return tmp_path / "page.json"

    monkeypatch.setattr(madoz_pipeline, "_make_staged_page", fake_staged)
    monkeypatch.setattr(madoz_pipeline, "write_staged_page", fake_write_page)

    class FakeProcessor:
        def process_page(self, record: SimpleNamespace) -> SimpleNamespace:
            assert lock_active
            assert "fingerprint-built" in events
            events.append(f"process-{record.canonicalSequenceIndex}")
            page = SimpleNamespace(
                logicalPageNumber=record.canonicalSequenceIndex,
                continuityBreakBefore=record.continuityBreakBefore,
            )
            processed_pages.append(page)
            return page

        def build_chunks(self, metadata: object, pages: list[SimpleNamespace]) -> list[str]:
            assert lock_active
            assert [page.logicalPageNumber for page in pages] == [1, 2]
            assert [page.continuityBreakBefore for page in pages] == [False, True]
            assert len(processed_pages) == 2
            events.append("chunks-built")
            return ["chunk"]

    @contextmanager
    def fake_open_processor(*args: object):
        assert lock_active
        events.append("processor-open")
        yield FakeProcessor()
        events.append("processor-close")

    monkeypatch.setattr(madoz_pipeline, "open_processor", fake_open_processor)
    monkeypatch.setattr(madoz_pipeline, "_build_metadata", lambda *a, **kw: object())

    def fake_finalize(**kwargs: object) -> object:
        assert lock_active
        assert kwargs["records"] is records
        assert [page.logicalPageNumber for page in kwargs["pages"]] == [1, 2]
        assert kwargs["chunks"] == ["chunk"]
        events.append("finalize")
        return result_sentinel

    monkeypatch.setattr(madoz_pipeline, "_assemble_and_write", fake_finalize)

    result = madoz_pipeline.prepare_document(
        tmp_path / "manifest.yaml",
        imports_root=tmp_path / "imports",
        data_root=tmp_path / "data",
        model_cache_root=tmp_path / "models",
    )

    assert result is result_sentinel
    assert events == [
        "lock-enter",
        "source-validated",
        "inventory-validated",
        "source-prepared",
        "model-lock-validated",
        "fingerprint-built",
        "processor-open",
        "process-1",
        "page-staged",
        "process-2",
        "page-staged",
        "chunks-built",
        "processor-close",
        "finalize",
        "lock-exit",
    ]


def test_prepare_document_all_cache_hit_skips_processor_and_writes(
    tmp_path: Path,
    monkeypatch,
) -> None:
    events: list[str] = []
    lock_active = [False]
    manifest = _make_manifest(tmp_path)
    records = _make_records()
    canonical_pdf = _make_canonical_pdf(tmp_path)
    fingerprint_payload = _make_fingerprint_payload()
    result_sentinel = object()

    staged_page_1 = SimpleNamespace(
        schemaVersion=1,
        canonicalPdfSha256=SHA_A,
        pageInventorySha256="sha256:" + "b" * 64,
        processingFingerprint=SHA_C,
        pageArtifactHash="sha256:" + "1" * 64,
        page=SimpleNamespace(
            documentId="madoz-11",
            logicalPageNumber=1,
            continuityBreakBefore=False,
        ),
    )
    staged_page_2 = SimpleNamespace(
        schemaVersion=1,
        canonicalPdfSha256=SHA_A,
        pageInventorySha256="sha256:" + "b" * 64,
        processingFingerprint=SHA_C,
        pageArtifactHash="sha256:" + "2" * 64,
        page=SimpleNamespace(
            documentId="madoz-11",
            logicalPageNumber=2,
            continuityBreakBefore=True,
        ),
    )

    load_calls: list[tuple[object, object, object, object, object, object]] = []

    def fake_load_reusable(
        data_root: object,
        document_id: object,
        logical_page_number: object,
        *,
        page_artifact_hash: object = None,
        processing_fingerprint: object,
        canonical_pdf_sha256: object,
        page_inventory_sha256: object,
        on_corrupt: object = None,
    ) -> SimpleNamespace | None:
        assert lock_active[0]
        load_calls.append(
            (
                data_root,
                document_id,
                logical_page_number,
                processing_fingerprint,
                canonical_pdf_sha256,
                page_inventory_sha256,
            )
        )
        assert page_artifact_hash is None
        if logical_page_number == 1:
            return staged_page_1
        if logical_page_number == 2:
            return staged_page_2
        return None

    monkeypatch.setattr(
        madoz_pipeline, "load_reusable_staged_page", fake_load_reusable
    )

    _patch_common(
        monkeypatch,
        tmp_path,
        manifest,
        records,
        canonical_pdf,
        fingerprint_payload,
        events,
        lock_active,
    )

    def fake_open_processor(*args: object) -> NoReturn:
        raise AssertionError("open_processor must not be called on all-cache-hit")

    monkeypatch.setattr(madoz_pipeline, "open_processor", fake_open_processor)

    build_chunks_calls: list[tuple[object, object, list[object]]] = []

    def fake_build_chunks(
        loaded_manifest: object,
        metadata: object,
        pages: list[object],
    ) -> list[str]:
        build_chunks_calls.append((loaded_manifest, metadata, pages))
        return ["chunk"]

    monkeypatch.setattr(
        madoz_pipeline, "_build_chunks", fake_build_chunks
    )

    assemble_calls: list[dict[str, object]] = []

    def fake_assemble(**kwargs: object) -> object:
        assemble_calls.append(kwargs)
        events.append("finalize")
        return result_sentinel

    monkeypatch.setattr(madoz_pipeline, "_assemble_and_write", fake_assemble)

    result = madoz_pipeline.prepare_document(
        tmp_path / "manifest.yaml",
        imports_root=tmp_path / "imports",
        data_root=tmp_path / "data",
        model_cache_root=tmp_path / "models",
    )

    assert result is result_sentinel
    assert len(load_calls) == 2
    for call in load_calls:
        data_root, document_id, logical_page_number, processing_fingerprint, canonical_pdf_sha256, page_inventory_sha256 = call
        assert data_root == tmp_path / "data"
        assert document_id == "madoz-11"
        assert processing_fingerprint == SHA_C
        assert canonical_pdf_sha256 == SHA_A
        assert page_inventory_sha256 == "sha256:" + "b" * 64
    assert [call[2] for call in load_calls] == [1, 2]

    assert len(build_chunks_calls) == 1
    manifest_arg, metadata_arg, pages_arg = build_chunks_calls[0]
    assert manifest_arg is manifest
    assert [page.logicalPageNumber for page in pages_arg] == [1, 2]
    assert [page.continuityBreakBefore for page in pages_arg] == [False, True]

    assert len(assemble_calls) == 1
    assemble_kwargs = assemble_calls[0]
    assert assemble_kwargs["records"] is records
    assert [page.logicalPageNumber for page in assemble_kwargs["pages"]] == [1, 2]
    assert assemble_kwargs["chunks"] == ["chunk"]
    assert assemble_kwargs["warnings"] == []

    assert events == [
        "lock-enter",
        "source-validated",
        "inventory-validated",
        "source-prepared",
        "model-lock-validated",
        "fingerprint-built",
        "finalize",
        "lock-exit",
    ]


def test_prepare_document_cache_corrupt_reprocesses_only_missing_page(
    tmp_path: Path,
    monkeypatch,
) -> None:
    events: list[str] = []
    lock_active = [False]
    manifest = _make_manifest(tmp_path)
    records = _make_records()
    canonical_pdf = _make_canonical_pdf(tmp_path)
    fingerprint_payload = _make_fingerprint_payload()
    result_sentinel = object()

    staged_page_1 = SimpleNamespace(
        schemaVersion=1,
        canonicalPdfSha256=SHA_A,
        pageInventorySha256="sha256:" + "b" * 64,
        processingFingerprint=SHA_C,
        pageArtifactHash="sha256:" + "1" * 64,
        page=SimpleNamespace(
            documentId="madoz-11",
            logicalPageNumber=1,
            continuityBreakBefore=False,
        ),
    )

    def fake_load_reusable(
        data_root: object,
        document_id: object,
        logical_page_number: object,
        *,
        page_artifact_hash: object = None,
        processing_fingerprint: object,
        canonical_pdf_sha256: object,
        page_inventory_sha256: object,
        on_corrupt: object = None,
    ) -> SimpleNamespace | None:
        assert lock_active[0]
        if logical_page_number == 1:
            return staged_page_1
        if logical_page_number == 2:
            assert on_corrupt is not None
            on_corrupt("invalid staged page")
            return None
        return None

    monkeypatch.setattr(
        madoz_pipeline, "load_reusable_staged_page", fake_load_reusable
    )

    _patch_common(
        monkeypatch,
        tmp_path,
        manifest,
        records,
        canonical_pdf,
        fingerprint_payload,
        events,
        lock_active,
    )

    processed_pages: list[SimpleNamespace] = []

    class FakeProcessor:
        def process_page(self, record: SimpleNamespace) -> SimpleNamespace:
            assert lock_active[0]
            assert record.canonicalSequenceIndex == 2
            events.append("process-2")
            page = SimpleNamespace(
                documentId="madoz-11",
                logicalPageNumber=2,
                continuityBreakBefore=True,
            )
            processed_pages.append(page)
            return page

        def build_chunks(self, metadata: object, pages: list[object]) -> list[str]:
            assert lock_active[0]
            assert [page.logicalPageNumber for page in pages] == [1, 2]
            events.append("chunks-built")
            return ["chunk"]

    @contextmanager
    def fake_open_processor(*args: object):
        assert lock_active[0]
        events.append("processor-open")
        yield FakeProcessor()
        events.append("processor-close")

    monkeypatch.setattr(madoz_pipeline, "open_processor", fake_open_processor)

    def fake_make_staged_page(
        page: object,
        *,
        canonical_pdf_sha256: str,
        page_inventory_sha256: str,
        processing_fingerprint: str,
    ) -> SimpleNamespace:
        assert lock_active[0]
        events.append("staged-made")
        return SimpleNamespace(
            schemaVersion=1,
            canonicalPdfSha256=canonical_pdf_sha256,
            pageInventorySha256=page_inventory_sha256,
            processingFingerprint=processing_fingerprint,
            pageArtifactHash="sha256:" + "2" * 64,
            page=page,
        )

    monkeypatch.setattr(madoz_pipeline, "_make_staged_page", fake_make_staged_page)

    def fake_write_staged_page(*args: object) -> Path:
        assert lock_active[0]
        events.append("page-staged")
        return tmp_path / "page.json"

    monkeypatch.setattr(madoz_pipeline, "write_staged_page", fake_write_staged_page)

    assemble_calls: list[dict[str, object]] = []

    def fake_assemble(**kwargs: object) -> object:
        assemble_calls.append(kwargs)
        events.append("finalize")
        return result_sentinel

    monkeypatch.setattr(madoz_pipeline, "_assemble_and_write", fake_assemble)

    result = madoz_pipeline.prepare_document(
        tmp_path / "manifest.yaml",
        imports_root=tmp_path / "imports",
        data_root=tmp_path / "data",
        model_cache_root=tmp_path / "models",
    )

    assert result is result_sentinel
    assert len(processed_pages) == 1
    assert processed_pages[0].logicalPageNumber == 2

    assert len(assemble_calls) == 1
    assemble_kwargs = assemble_calls[0]
    assert assemble_kwargs["warnings"] == ["logical page 2: invalid staged page"]
    assert [page.logicalPageNumber for page in assemble_kwargs["pages"]] == [1, 2]

    assert events == [
        "lock-enter",
        "source-validated",
        "inventory-validated",
        "source-prepared",
        "model-lock-validated",
        "fingerprint-built",
        "processor-open",
        "process-2",
        "staged-made",
        "page-staged",
        "chunks-built",
        "processor-close",
        "finalize",
        "lock-exit",
    ]


def test_prepare_document_process_page_exception_propagates_without_assembly(
    tmp_path: Path,
    monkeypatch,
) -> None:
    events: list[str] = []
    lock_active = [False]
    manifest = _make_manifest(tmp_path)
    records = _make_records()
    canonical_pdf = _make_canonical_pdf(tmp_path)
    fingerprint_payload = _make_fingerprint_payload()

    staged_page_1 = SimpleNamespace(
        schemaVersion=1,
        canonicalPdfSha256=SHA_A,
        pageInventorySha256="sha256:" + "b" * 64,
        processingFingerprint=SHA_C,
        pageArtifactHash="sha256:" + "1" * 64,
        page=SimpleNamespace(
            documentId="madoz-11",
            logicalPageNumber=1,
            continuityBreakBefore=False,
        ),
    )

    def fake_load_reusable(
        data_root: object,
        document_id: object,
        logical_page_number: object,
        *,
        page_artifact_hash: object = None,
        processing_fingerprint: object,
        canonical_pdf_sha256: object,
        page_inventory_sha256: object,
        on_corrupt: object = None,
    ) -> SimpleNamespace | None:
        assert lock_active[0]
        if logical_page_number == 1:
            return staged_page_1
        if logical_page_number == 2:
            return None
        return None

    monkeypatch.setattr(
        madoz_pipeline, "load_reusable_staged_page", fake_load_reusable
    )

    _patch_common(
        monkeypatch,
        tmp_path,
        manifest,
        records,
        canonical_pdf,
        fingerprint_payload,
        events,
        lock_active,
    )

    class FakeProcessor:
        def process_page(self, record: SimpleNamespace) -> NoReturn:
            assert lock_active[0]
            assert record.canonicalSequenceIndex == 2
            events.append("process-2")
            raise RuntimeError("process_page failed")

        def build_chunks(self, metadata: object, pages: list[object]) -> list[str]:
            raise AssertionError("build_chunks must not be called")

    @contextmanager
    def fake_open_processor(*args: object):
        assert lock_active[0]
        events.append("processor-open")
        yield FakeProcessor()
        events.append("processor-close")

    monkeypatch.setattr(madoz_pipeline, "open_processor", fake_open_processor)

    assemble_called = False

    def fake_assemble(**kwargs: object) -> object:
        nonlocal assemble_called
        assemble_called = True
        return object()

    monkeypatch.setattr(madoz_pipeline, "_assemble_and_write", fake_assemble)

    write_staged_page_called = False

    def fake_write_staged_page(*args: object) -> Path:
        nonlocal write_staged_page_called
        write_staged_page_called = True
        return tmp_path / "page.json"

    monkeypatch.setattr(madoz_pipeline, "write_staged_page", fake_write_staged_page)

    try:
        madoz_pipeline.prepare_document(
            tmp_path / "manifest.yaml",
            imports_root=tmp_path / "imports",
            data_root=tmp_path / "data",
            model_cache_root=tmp_path / "models",
        )
        assert False, "expected RuntimeError to propagate"
    except RuntimeError as exc:
        assert str(exc) == "process_page failed"

    assert not assemble_called
    assert not write_staged_page_called
    assert "process-2" in events
    assert "finalize" not in events


def test_build_metadata_and_assemble_write_match_prepared_document_fixture(
    tmp_path: Path,
) -> None:
    fixture_path = Path(__file__).parent / "prepared-document.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    prepared = PreparedDocument.model_validate(fixture)

    manifest = SimpleNamespace(
        document=SimpleNamespace(
            documentId=prepared.metadata.documentId,
            workId=prepared.metadata.workId,
            title=prepared.metadata.title,
            edition=prepared.metadata.edition,
            volumeNumber=prepared.metadata.volumeNumber,
            author=prepared.metadata.author,
            language=prepared.metadata.language,
            countryCode=prepared.metadata.countryCode,
            publicationYear=prepared.metadata.publicationYear,
            sourceClass=prepared.metadata.sourceClass,
            sourceUrl=prepared.metadata.sourceUrl,
            repositoryName=prepared.metadata.repositoryName,
            temporalScope=prepared.metadata.temporalScope,
            attribution=prepared.metadata.attribution,
            historicalPeriod=prepared.metadata.historicalPeriod,
        ),
        source=SimpleNamespace(
            sourceUrl=prepared.metadata.sourceUrl,
            repositoryName=prepared.metadata.repositoryName,
            attribution=prepared.metadata.attribution,
            isExactRecord=prepared.metadata.sourceIsExactRecord,
            expectedSha256=prepared.metadata.canonicalPdfSha256.removeprefix("sha256:"),
            rights=prepared.metadata.rights,
        ),
        coverage=SimpleNamespace(
            status=prepared.metadata.coverageStatus,
            statement=prepared.metadata.coverageStatement,
            missingPrintedPages=prepared.metadata.missingPrintedPages,
            observedPrintedRanges=prepared.metadata.observedPrintedRanges,
            acceptedAt=prepared.metadata.coverageAcceptedAt,
            acceptedForProduct=prepared.metadata.coverageAcceptedForProduct,
        ),
        selection=SimpleNamespace(
            expectedPageInventorySha256=prepared.metadata.pageInventorySha256.removeprefix(
                "sha256:"
            ),
            inventoryVerifiedAt=prepared.inventoryVerifiedAt,
            candidatePdfPageRanges=tuple(
                SimpleNamespace(start=r.start, end=r.end)
                for r in prepared.processing.selection.candidatePdfPageRanges
            ),
            canonicalization=SimpleNamespace(
                defaultOrder=prepared.processing.selection.canonicalization.defaultOrder,
                defaultStatus=prepared.processing.selection.canonicalization.defaultStatus,
                duplicateDecisions=prepared.processing.selection.canonicalization.duplicateDecisions,
                pageOverrides=prepared.processing.selection.canonicalization.pageOverrides,
            ),
        ),
        processing=SimpleNamespace(
            maxChunkChars=prepared.processing.chunking.maxChunkChars,
            overlapLines=prepared.processing.chunking.overlapLines,
        ),
        prepare_allowed=True,
        publish_allowed=False,
    )

    canonical_pdf = CanonicalPdf(
        path=tmp_path / prepared.canonicalPdfRelativePath,
        sha256=prepared.metadata.canonicalPdfSha256,
    )

    records = prepared.inventoryRecords
    pages = prepared.pages
    chunks = prepared.chunks
    processing = prepared.processing
    processing_fingerprint = prepared.processingFingerprint
    prepared_at = prepared.preparedAt

    metadata = madoz_pipeline._build_metadata(
        manifest,
        canonical_pdf,
        prepared.metadata.pageInventorySha256,
        processing_fingerprint,
    )
    assert metadata == prepared.metadata

    result = madoz_pipeline._assemble_and_write(
        manifest=manifest,
        canonical_pdf=canonical_pdf,
        metadata=metadata,
        records=records,
        pages=pages,
        chunks=chunks,
        processing=processing,
        processing_fingerprint=processing_fingerprint,
        data_root=tmp_path,
        prepared_at=prepared_at,
        warnings=[],
    )

    assert isinstance(result, madoz_pipeline.PreparationResult)
    assert result.prepared_document == prepared
    assert result.report is not None
    assert result.source_path is not None
    assert result.prepared_document_path is not None
    assert result.report_path is not None

    doc_path = result.prepared_document_path
    source_path = result.source_path
    report_path = result.report_path

    assert doc_path.exists()
    assert source_path.exists()
    assert report_path.exists()

    loaded_doc = load_prepared_document(tmp_path, doc_path.relative_to(tmp_path).as_posix())
    assert loaded_doc == prepared

    loaded_source = json.loads(source_path.read_text(encoding="utf-8"))
    assert loaded_source["canonicalPdfSha256"] == prepared.metadata.canonicalPdfSha256
    assert loaded_source["pageInventorySha256"] == prepared.metadata.pageInventorySha256
    assert loaded_source["processingFingerprint"] == prepared.processingFingerprint
    assert loaded_source["manifest"]["source"]["sourceUrl"] == prepared.metadata.sourceUrl
    assert loaded_source["manifest"]["source"]["rights"] == prepared.metadata.rights.model_dump(
        mode="json", by_alias=True, exclude_none=False
    )
    assert loaded_source["coverage"] == prepared.publicationGate.coverage.model_dump(
        mode="json", by_alias=True, exclude_none=False
    )
    assert loaded_source["canonicalization"] == prepared.canonicalization.model_dump(
        mode="json", by_alias=True, exclude_none=False
    )
    assert loaded_source["processing"] == prepared.processing.model_dump(
        mode="json", by_alias=True, exclude_none=False
    )

    loaded_report = json.loads(report_path.read_text(encoding="utf-8"))
    assert loaded_report == result.report.model_dump(
        mode="json", by_alias=True, exclude_none=False
    )
    assert result.report.logicalPages == len(prepared.pages)
    assert result.report.inventoryIncluded == len(prepared.pages)
    assert result.report.ocrPages == len(prepared.pages)
    assert result.report.chunks == len(prepared.chunks)
    assert result.report.publicationGate == prepared.publicationGate
    assert result.report.publicationGate.coverage.missingPrintedPages == (
        prepared.metadata.missingPrintedPages
    )
    assert result.report.blockingReasons == sorted(result.report.blockingReasons)

    first_doc_bytes = doc_path.read_bytes()
    first_source_bytes = source_path.read_bytes()
    first_report_bytes = report_path.read_bytes()

    result2 = madoz_pipeline._assemble_and_write(
        manifest=manifest,
        canonical_pdf=canonical_pdf,
        metadata=metadata,
        records=records,
        pages=pages,
        chunks=chunks,
        processing=processing,
        processing_fingerprint=processing_fingerprint,
        data_root=tmp_path,
        prepared_at=prepared_at,
        warnings=[],
    )

    assert result2.prepared_document == prepared
    assert doc_path.read_bytes() == first_doc_bytes
    assert source_path.read_bytes() == first_source_bytes
    assert report_path.read_bytes() == first_report_bytes


def _make_eval_manifest_from_fixture(tmp_path: Path) -> SimpleNamespace:
    fixture_path = Path(__file__).parent / "prepared-document.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    prepared = PreparedDocument.model_validate(fixture)

    return SimpleNamespace(
        document=SimpleNamespace(
            documentId=prepared.metadata.documentId,
            workId=prepared.metadata.workId,
            title=prepared.metadata.title,
            edition=prepared.metadata.edition,
            volumeNumber=prepared.metadata.volumeNumber,
            author=prepared.metadata.author,
            language=prepared.metadata.language,
            countryCode=prepared.metadata.countryCode,
            publicationYear=prepared.metadata.publicationYear,
            sourceClass=prepared.metadata.sourceClass,
            sourceUrl=prepared.metadata.sourceUrl,
            repositoryName=prepared.metadata.repositoryName,
            temporalScope=prepared.metadata.temporalScope,
            attribution=prepared.metadata.attribution,
            historicalPeriod=prepared.metadata.historicalPeriod,
        ),
        source=SimpleNamespace(
            sourceUrl=prepared.metadata.sourceUrl,
            repositoryName=prepared.metadata.repositoryName,
            attribution=prepared.metadata.attribution,
            isExactRecord=prepared.metadata.sourceIsExactRecord,
            expectedSha256=prepared.metadata.canonicalPdfSha256.removeprefix("sha256:"),
            rights=prepared.metadata.rights,
        ),
        coverage=SimpleNamespace(
            status=prepared.metadata.coverageStatus,
            statement=prepared.metadata.coverageStatement,
            missingPrintedPages=prepared.metadata.missingPrintedPages,
            observedPrintedRanges=prepared.metadata.observedPrintedRanges,
            acceptedAt=prepared.metadata.coverageAcceptedAt,
            acceptedForProduct=prepared.metadata.coverageAcceptedForProduct,
        ),
        selection=SimpleNamespace(
            expectedPageInventorySha256=prepared.metadata.pageInventorySha256.removeprefix(
                "sha256:"
            ),
            inventoryVerifiedAt=prepared.inventoryVerifiedAt,
            candidatePdfPageRanges=tuple(
                SimpleNamespace(start=r.start, end=r.end)
                for r in prepared.processing.selection.candidatePdfPageRanges
            ),
            canonicalization=SimpleNamespace(
                defaultOrder=prepared.processing.selection.canonicalization.defaultOrder,
                defaultStatus=prepared.processing.selection.canonicalization.defaultStatus,
                duplicateDecisions=prepared.processing.selection.canonicalization.duplicateDecisions,
                pageOverrides=prepared.processing.selection.canonicalization.pageOverrides,
            ),
        ),
        processing=SimpleNamespace(
            maxChunkChars=prepared.processing.chunking.maxChunkChars,
            overlapLines=prepared.processing.chunking.overlapLines,
        ),
        prepare_allowed=True,
        publish_allowed=False,
    )


def _make_eval_records() -> list[SimpleNamespace]:
    return [
        _record(12, "include", 3),
        _record(11, "exclude_nonbody", None),
        _record(10, "include", 1),
        _record(9, "include", 2),
        _record(8, "pending_review", None),
    ]


def _patch_eval_common(
    monkeypatch,
    tmp_path: Path,
    manifest: SimpleNamespace,
    records: list[SimpleNamespace],
    canonical_pdf: SimpleNamespace,
    fingerprint_payload: SimpleNamespace,
    events: list[str],
    lock_active: list[bool],
) -> None:
    inventory_path = tmp_path / "inventory.jsonl"

    @contextmanager
    def fake_lock(path: Path):
        assert path == tmp_path / "data" / "locks" / "madoz-prepare.lock"
        events.append("lock-enter")
        lock_active[0] = True
        try:
            yield
        finally:
            events.append("lock-exit")
            lock_active[0] = False

    def fake_validate(loaded_manifest: object, imports_root: Path) -> SimpleNamespace:
        assert lock_active[0]
        assert loaded_manifest is manifest
        events.append("source-validated")
        return SimpleNamespace(
            inventory_path=inventory_path,
            inventory_sha256="b" * 64,
            pdf_sha256="a" * 64,
        )

    def fake_inventory(payload: bytes, loaded_manifest: object) -> list[SimpleNamespace]:
        assert lock_active[0]
        assert payload == b"inventory"
        assert loaded_manifest is manifest
        events.append("inventory-validated")
        return records

    def fake_prepare_source(*args: object) -> SimpleNamespace:
        assert lock_active[0]
        events.append("source-prepared")
        return canonical_pdf

    def fake_load_model_lock(*args: object) -> object:
        assert lock_active[0]
        events.append("model-lock-validated")
        return object()

    def fake_fingerprint(*args: object) -> tuple[object, str]:
        assert lock_active[0]
        events.append("fingerprint-built")
        return fingerprint_payload, SHA_C

    monkeypatch.setattr(madoz_pipeline, "load_manifest", lambda path: manifest)
    monkeypatch.setattr(madoz_pipeline, "exclusive_lock", fake_lock)
    monkeypatch.setattr(madoz_pipeline, "validate_manifest_source", fake_validate)
    monkeypatch.setattr(madoz_pipeline, "load_verified_inventory", fake_inventory)
    monkeypatch.setattr(madoz_pipeline, "prepare_source", fake_prepare_source)
    monkeypatch.setattr(madoz_pipeline, "load_model_lock", fake_load_model_lock)
    monkeypatch.setattr(madoz_pipeline, "build_processing_fingerprint", fake_fingerprint)
    monkeypatch.setattr(madoz_pipeline, "_build_metadata", lambda *a, **kw: object())


def test_prepare_evaluation_sample_valid_sparse_refs(
    tmp_path: Path,
    monkeypatch,
) -> None:
    events: list[str] = []
    lock_active = [False]
    manifest = _make_manifest(tmp_path)
    records = _make_eval_records()
    canonical_pdf = _make_canonical_pdf(tmp_path)
    fingerprint_payload = _make_fingerprint_payload()
    result_sentinel = object()

    refs = [(12, "full"), (10, "full")]

    _patch_eval_common(
        monkeypatch,
        tmp_path,
        manifest,
        records,
        canonical_pdf,
        fingerprint_payload,
        events,
        lock_active,
    )

    cached_page = SimpleNamespace(
        logicalPageNumber=1,
        continuityBreakBefore=False,
    )

    def fake_load_reusable(
        *args: object,
        **kwargs: object,
    ) -> SimpleNamespace | None:
        assert "page_artifact_hash" not in kwargs
        assert kwargs["processing_fingerprint"] == SHA_C
        if args[2] == 1:
            return SimpleNamespace(page=cached_page)
        return None

    monkeypatch.setattr(
        madoz_pipeline,
        "load_reusable_staged_page",
        fake_load_reusable,
    )

    def fake_make_staged_page(
        page: object,
        *,
        canonical_pdf_sha256: str,
        page_inventory_sha256: str,
        processing_fingerprint: str,
    ) -> SimpleNamespace:
        assert lock_active[0]
        events.append("staged-made")
        return SimpleNamespace(
            schemaVersion=1,
            canonicalPdfSha256=canonical_pdf_sha256,
            pageInventorySha256=page_inventory_sha256,
            processingFingerprint=processing_fingerprint,
            pageArtifactHash="sha256:" + "e" * 64,
            page=page,
        )

    monkeypatch.setattr(madoz_pipeline, "_make_staged_page", fake_make_staged_page)

    def fake_write_staged_page(*args: object) -> Path:
        assert lock_active[0]
        events.append("page-staged")
        return tmp_path / "page.json"

    monkeypatch.setattr(madoz_pipeline, "write_staged_page", fake_write_staged_page)

    processed_pages: list[SimpleNamespace] = []

    class FakeProcessor:
        def process_page(self, record: SimpleNamespace) -> SimpleNamespace:
            assert lock_active[0]
            events.append(f"process-{record.canonicalSequenceIndex}")
            page = SimpleNamespace(
                logicalPageNumber=record.canonicalSequenceIndex,
                continuityBreakBefore=record.continuityBreakBefore,
            )
            processed_pages.append(page)
            return page

        def build_chunks(self, metadata: object, pages: list[SimpleNamespace]) -> list[str]:
            assert lock_active[0]
            assert [page.logicalPageNumber for page in pages] == [1, 3]
            assert [page.continuityBreakBefore for page in pages] == [False, True]
            events.append("chunks-built")
            return ["chunk"]

    @contextmanager
    def fake_open_processor(*args: object):
        assert lock_active[0]
        events.append("processor-open")
        yield FakeProcessor()
        events.append("processor-close")

    monkeypatch.setattr(madoz_pipeline, "open_processor", fake_open_processor)

    assemble_calls: list[dict[str, object]] = []

    def fake_assemble_sample_and_write(**kwargs: object) -> object:
        assemble_calls.append(kwargs)
        events.append("finalize")
        return result_sentinel

    monkeypatch.setattr(madoz_pipeline, "_assemble_sample_and_write", fake_assemble_sample_and_write)

    assemble_and_write_called = False

    def fake_assemble_and_write(**kwargs: object) -> object:
        nonlocal assemble_and_write_called
        assemble_and_write_called = True
        return object()

    monkeypatch.setattr(madoz_pipeline, "_assemble_and_write", fake_assemble_and_write)

    result = madoz_pipeline.prepare_evaluation_sample(
        tmp_path / "manifest.yaml",
        refs,
        imports_root=tmp_path / "imports",
        data_root=tmp_path / "data",
        model_cache_root=tmp_path / "models",
    )

    assert result is result_sentinel
    assert not assemble_and_write_called
    assert len(assemble_calls) == 1
    assemble_kwargs = assemble_calls[0]
    assert [page.logicalPageNumber for page in assemble_kwargs["pages"]] == [1, 3]
    assert [page.continuityBreakBefore for page in assemble_kwargs["pages"]] == [False, False]
    assert assemble_kwargs["chunks"] == ["chunk"]

    assert [page.logicalPageNumber for page in processed_pages] == [3]

    assert events == [
        "lock-enter",
        "source-validated",
        "inventory-validated",
        "source-prepared",
        "model-lock-validated",
        "fingerprint-built",
        "processor-open",
        "process-3",
        "staged-made",
        "page-staged",
        "chunks-built",
        "processor-close",
        "finalize",
        "lock-exit",
    ]


@pytest.mark.parametrize(
    "refs, expected_error",
    [
        ([], "refs must not be empty"),
        ([(i, "full") for i in range(65)], "refs must not exceed 64"),
        ([(10, "full"), (10, "full")], "refs must not contain duplicates"),
        ([(10, "left")], "side must be 'full'"),
        ([(13, "full")], "ref not found in inventory"),
        ([(11, "full")], "ref is excluded"),
        ([(8, "full")], "ref is pending"),
    ],
)
def test_prepare_evaluation_sample_rejects_invalid_refs(
    tmp_path: Path,
    monkeypatch,
    refs: list[tuple[int, str]],
    expected_error: str,
) -> None:
    events: list[str] = []
    lock_active = [False]
    manifest = _make_manifest(tmp_path)
    records = _make_eval_records()
    canonical_pdf = _make_canonical_pdf(tmp_path)
    fingerprint_payload = _make_fingerprint_payload()

    _patch_eval_common(
        monkeypatch,
        tmp_path,
        manifest,
        records,
        canonical_pdf,
        fingerprint_payload,
        events,
        lock_active,
    )

    monkeypatch.setattr(madoz_pipeline, "load_reusable_staged_page", lambda *a, **kw: None)

    def fake_open_processor(*args: object) -> NoReturn:
        raise AssertionError("open_processor must not be called for invalid refs")

    monkeypatch.setattr(madoz_pipeline, "open_processor", fake_open_processor)

    with pytest.raises(Exception) as exc_info:
        madoz_pipeline.prepare_evaluation_sample(
            tmp_path / "manifest.yaml",
            refs,
            imports_root=tmp_path / "imports",
            data_root=tmp_path / "data",
            model_cache_root=tmp_path / "models",
        )

    assert expected_error in str(exc_info.value)
    assert "processor-open" not in events


def test_assemble_sample_and_write_real_ocr_evaluation_sample_qw14d(
    tmp_path: Path,
) -> None:
    fixture_path = Path(__file__).parent / "prepared-document.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    prepared = PreparedDocument.model_validate(fixture)

    manifest = _make_eval_manifest_from_fixture(tmp_path)

    canonical_pdf = CanonicalPdf(
        path=tmp_path / prepared.canonicalPdfRelativePath,
        sha256=prepared.metadata.canonicalPdfSha256,
    )

    records = prepared.inventoryRecords
    pages = prepared.pages
    chunks = prepared.chunks
    processing = prepared.processing
    processing_fingerprint = prepared.processingFingerprint
    prepared_at = prepared.preparedAt

    metadata = madoz_pipeline._build_metadata(
        manifest,
        canonical_pdf,
        prepared.metadata.pageInventorySha256,
        processing_fingerprint,
    )

    warning = "test warning for evaluation sample"

    result = madoz_pipeline._assemble_sample_and_write(
        canonical_pdf=canonical_pdf,
        metadata=metadata,
        selected_records=records,
        inventory_verified_at=prepared.inventoryVerifiedAt,
        pages=pages,
        chunks=chunks,
        processing=processing,
        processing_fingerprint=processing_fingerprint,
        data_root=tmp_path,
        created_at=prepared_at,
        warnings=[warning],
    )

    assert isinstance(result, madoz_pipeline.EvaluationSampleResult)
    assert result.sample.publishable is False
    assert result.warnings == (warning,)

    sample_path = result.path
    assert sample_path.exists()

    loaded = load_evaluation_sample(tmp_path, sample_path.relative_to(tmp_path).as_posix())
    assert loaded == result.sample

    assert len(loaded.selectedPages) == 1
    sp = loaded.selectedPages[0]
    assert sp.pdfPage == records[0].pdfPage
    assert sp.side == records[0].side
    assert sp.logicalPageNumber == records[0].canonicalSequenceIndex

    assert loaded.selectedInventoryRecords == records

    stage_directory = sample_path.parent.parent
    assert not (stage_directory / "source.json").exists()
    assert not (stage_directory / "prepared-document.json").exists()
    assert not (stage_directory / "preparation-report.json").exists()

    first_bytes = sample_path.read_bytes()
    first_hash = result.sample.sampleHash

    result2 = madoz_pipeline._assemble_sample_and_write(
        canonical_pdf=canonical_pdf,
        metadata=metadata,
        selected_records=records,
        inventory_verified_at=prepared.inventoryVerifiedAt,
        pages=pages,
        chunks=chunks,
        processing=processing,
        processing_fingerprint=processing_fingerprint,
        data_root=tmp_path,
        created_at=prepared_at,
        warnings=[warning],
    )

    assert result2.sample.sampleHash == first_hash
    assert sample_path.read_bytes() == first_bytes
