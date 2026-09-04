from __future__ import annotations

import copy
import hashlib
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel

from .identity import canonical_json_bytes
from .ingest_models import (
    CoverageMetadata,
    FingerprintPayload,
    OcrEvaluationPageRef,
    OcrEvaluationSample,
    PageInventoryRecord,
    PreparationReport,
    PreparedChunkInput,
    PreparedDocument,
    PublicationGateSnapshot,
    SourcePageInput,
    StagedPage,
)
from .locks import exclusive_lock
from .madoz_chunking import build_prepared_chunks
from .madoz_processor import open_processor, prepare_source
from .manifest import MadozManifest, load_manifest, validate_manifest_source
from .models import DocumentMetadata, RightsMetadata
from .text_corrections import (
    CorrectionSetError,
    LoadedCorrectionSet,
    apply_corrections,
    load_correction_set,
)
from .ocr_backend import load_model_lock
from .page_inventory import load_verified_inventory
from .processing_fingerprint import CanonicalPdf, build_processing_fingerprint
from .staging import (
    load_reusable_staged_page,
    staging_paths,
    write_evaluation_sample,
    write_preparation_report,
    write_prepared_document,
    write_source_snapshot,
    write_staged_page,
)


class PipelineError(RuntimeError):
    pass


@dataclass(frozen=True)
class PreparationResult:
    prepared_document: PreparedDocument
    report: PreparationReport
    source_path: Path
    prepared_document_path: Path
    report_path: Path
    warnings: tuple[str, ...]


@dataclass(frozen=True)
class EvaluationSampleResult:
    sample: OcrEvaluationSample
    path: Path
    warnings: tuple[str, ...]


def _jsonable(value: object) -> object:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json", by_alias=True, exclude_none=False)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    attributes = getattr(value, "__dict__", None)
    if isinstance(attributes, dict):
        return {
            key: _jsonable(item)
            for key, item in attributes.items()
            if not key.startswith("_")
        }
    return value


def _as_aware_datetime(value: datetime | str, *, label: str) -> datetime:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise PipelineError(f"{label} must be ISO-8601") from exc
    if value.tzinfo is None or value.utcoffset() is None:
        raise PipelineError(f"{label} must include a timezone")
    return value


def _page_artifact_hash(page: SourcePageInput) -> str:
    payload = page.model_dump(mode="json", by_alias=True, exclude_none=False)
    return "sha256:" + hashlib.sha256(canonical_json_bytes(payload)).hexdigest()


def _make_staged_page(
    page: SourcePageInput,
    *,
    canonical_pdf_sha256: str,
    page_inventory_sha256: str,
    processing_fingerprint: str,
) -> StagedPage:
    return StagedPage(
        schemaVersion=1,
        canonicalPdfSha256=canonical_pdf_sha256,
        pageInventorySha256=page_inventory_sha256,
        processingFingerprint=processing_fingerprint,
        pageArtifactHash=_page_artifact_hash(page),
        page=page,
    )


def _build_metadata(
    manifest: MadozManifest,
    canonical_pdf: CanonicalPdf,
    page_inventory_sha256: str,
    processing_fingerprint: str,
) -> DocumentMetadata:
    document = manifest.document
    source = manifest.source
    coverage = manifest.coverage
    return DocumentMetadata(
        documentId=document.documentId,
        sourceUrl=source.sourceUrl,
        title=document.title,
        author=document.author,
        edition=document.edition,
        publicationYear=document.publicationYear,
        language=document.language,
        countryCode=document.countryCode,
        sourceClass=document.sourceClass,
        contentHash=canonical_pdf.sha256,
        rights=RightsMetadata.model_validate(_jsonable(source.rights)),
        workId=document.workId,
        volumeNumber=document.volumeNumber,
        repositoryName=source.repositoryName,
        historicalPeriod=document.historicalPeriod,
        temporalScope=document.temporalScope,
        attribution=source.attribution,
        sourceIsExactRecord=source.isExactRecord,
        canonicalPdfSha256=canonical_pdf.sha256,
        processingFingerprint=processing_fingerprint,
        pageInventorySha256=page_inventory_sha256,
        coverageStatus=coverage.status,
        coverageStatement=coverage.statement,
        observedPrintedRanges=_jsonable(coverage.observedPrintedRanges),
        missingPrintedPages=list(coverage.missingPrintedPages),
        coverageAcceptedForProduct=coverage.acceptedForProduct,
        coverageAcceptedAt=coverage.acceptedAt,
    )


def _load_corrections(
    manifest: MadozManifest,
    imports_root: str | Path,
) -> LoadedCorrectionSet | None:
    corrections_config = getattr(manifest.processing, "corrections", None)
    if corrections_config is None:
        return None
    try:
        return load_correction_set(
            corrections_config,
            imports_root,
            manifest.document.documentId,
        )
    except CorrectionSetError as exc:
        raise PipelineError(f"correction set error: {exc}") from None


def _apply_corrections(
    pages: Sequence[SourcePageInput],
    correction_set: LoadedCorrectionSet | None,
) -> list[SourcePageInput]:
    if correction_set is None:
        return list(pages)
    try:
        return apply_corrections(pages, correction_set)
    except CorrectionSetError as exc:
        raise PipelineError(f"correction set error: {exc}") from None


def _build_chunks(
    manifest: MadozManifest,
    metadata: DocumentMetadata,
    pages: Sequence[SourcePageInput],
) -> list[PreparedChunkInput]:
    return build_prepared_chunks(
        metadata,
        pages,
        manifest.processing.maxChunkChars,
        manifest.processing.overlapLines,
    )


def _blocking_reasons(manifest: MadozManifest) -> list[str]:
    reasons: list[str] = []
    rights = manifest.source.rights
    coverage = manifest.coverage
    if not manifest.prepare_allowed:
        reasons.append("inventory_not_verified")
    if not manifest.source.isExactRecord:
        reasons.append("source_not_exact_record")
    if rights.status != "reviewed_reusable" or not rights.isExplicitlyReusable:
        reasons.append("rights_not_reusable")
    if (
        coverage.status == "unknown"
        or not coverage.acceptedForProduct
        or coverage.acceptedAt is None
    ):
        reasons.append("coverage_not_accepted")
    return sorted(set(reasons))


def _assemble_and_write(
    *,
    manifest: MadozManifest,
    canonical_pdf: CanonicalPdf,
    metadata: DocumentMetadata,
    records: Sequence[PageInventoryRecord],
    pages: Sequence[SourcePageInput],
    chunks: Sequence[PreparedChunkInput],
    processing: FingerprintPayload,
    processing_fingerprint: str,
    data_root: str | Path,
    prepared_at: datetime | None,
    warnings: Sequence[str],
) -> PreparationResult:
    data_path = Path(data_root)
    coverage = CoverageMetadata.model_validate(_jsonable(manifest.coverage))
    publication_gate = PublicationGateSnapshot(
        sourceIsExactRecord=manifest.source.isExactRecord,
        coverage=coverage,
    )
    timestamp = _as_aware_datetime(
        prepared_at or datetime.now(timezone.utc),
        label="prepared_at",
    )
    inventory_verified_at = _as_aware_datetime(
        manifest.selection.inventoryVerifiedAt,
        label="selection.inventoryVerifiedAt",
    )
    try:
        canonical_relative_path = canonical_pdf.path.resolve().relative_to(
            data_path.resolve()
        ).as_posix()
    except ValueError as exc:
        raise PipelineError("canonical PDF must be inside data_root") from exc

    page_list = list(pages)
    record_list = list(records)
    chunk_list = list(chunks)
    page_hashes = [_page_artifact_hash(page) for page in page_list]
    candidate = PreparedDocument.model_construct(
        schemaVersion=1,
        preparedDocumentHash="sha256:" + "0" * 64,
        metadata=metadata,
        publicationGate=publication_gate,
        chunks=chunk_list,
        pages=page_list,
        pageArtifactHashes=page_hashes,
        pageInventorySha256=processing.selection.pageInventorySha256,
        inventoryVerifiedAt=inventory_verified_at,
        inventoryRecords=record_list,
        canonicalization=processing.selection.canonicalization,
        canonicalPdfRelativePath=canonical_relative_path,
        processing=processing,
        processingFingerprint=processing_fingerprint,
        preparedAt=timestamp,
    )
    prepared_payload = candidate.model_dump(
        mode="json",
        by_alias=True,
        exclude_none=False,
    )
    hash_payload = dict(prepared_payload)
    hash_payload.pop("preparedDocumentHash")
    hash_payload.pop("canonicalPdfRelativePath")
    hash_payload.pop("preparedAt")
    prepared_payload["preparedDocumentHash"] = "sha256:" + hashlib.sha256(
        canonical_json_bytes(hash_payload)
    ).hexdigest()
    prepared_document = PreparedDocument.model_validate(prepared_payload)

    paths = staging_paths(
        data_path,
        metadata.documentId,
        processing_fingerprint,
    )
    stage_relative_path = paths.preparation_report.relative_to(data_path).as_posix()
    body_line_ids = {
        line.lineId
        for page in page_list
        for line in page.lines
        if line.role == "body"
    }
    table_line_ids = {
        line.lineId
        for page in page_list
        for line in page.lines
        if line.role == "table"
    }
    assigned_line_ids = {line_id for chunk in chunk_list for line_id in chunk.lineIds}
    blank_pages = sorted(
        page.logicalPageNumber for page in page_list if "blank" in page.qualityFlags
    )
    low_quality_pages = sorted(
        page.logicalPageNumber
        for page in page_list
        if "low_confidence" in page.qualityFlags
    )
    report = PreparationReport(
        schemaVersion=1,
        documentId=metadata.documentId,
        pdfSha256=canonical_pdf.sha256,
        pageInventorySha256=processing.selection.pageInventorySha256,
        processingFingerprint=processing_fingerprint,
        preparedDocumentHash=prepared_document.preparedDocumentHash,
        publicationGate=publication_gate,
        prepareAllowed=manifest.prepare_allowed,
        publishAllowed=manifest.publish_allowed,
        blockingReasons=_blocking_reasons(manifest),
        candidatePdfPages=sum(
            page_range.end - page_range.start + 1
            for page_range in manifest.selection.candidatePdfPageRanges
        ),
        logicalPages=len(page_list),
        inventoryIncluded=sum(record.canonicalStatus == "include" for record in record_list),
        inventoryExcludedDuplicates=sum(
            record.canonicalStatus == "exclude_duplicate" for record in record_list
        ),
        inventoryExcludedNonbody=sum(
            record.canonicalStatus == "exclude_nonbody" for record in record_list
        ),
        blankPages=blank_pages,
        ocrPages=len(page_list),
        lowQualityPages=low_quality_pages,
        unassignedBodyLines=len(body_line_ids - assigned_line_ids),
        unassignedTableLines=len(table_line_ids - assigned_line_ids),
        chunks=len(chunk_list),
        stageRelativePath=stage_relative_path,
        preparedAt=timestamp,
    )
    source_snapshot = {
        "schemaVersion": 1,
        "manifest": _jsonable(manifest),
        "canonicalPdfSha256": canonical_pdf.sha256,
        "pageInventorySha256": processing.selection.pageInventorySha256,
        "canonicalization": _jsonable(processing.selection.canonicalization),
        "coverage": _jsonable(manifest.coverage),
        "processing": _jsonable(processing),
        "processingFingerprint": processing_fingerprint,
    }

    source_path = write_source_snapshot(
        data_path,
        metadata.documentId,
        processing_fingerprint,
        source_snapshot,
    )
    prepared_document_path = write_prepared_document(data_path, prepared_document)
    report_path = write_preparation_report(data_path, report)
    return PreparationResult(
        prepared_document=prepared_document,
        report=report,
        source_path=source_path,
        prepared_document_path=prepared_document_path,
        report_path=report_path,
        warnings=tuple(warnings),
    )


def _assemble_sample_and_write(
    *,
    metadata: DocumentMetadata,
    selected_records: Sequence[PageInventoryRecord],
    pages: Sequence[SourcePageInput],
    chunks: Sequence[PreparedChunkInput],
    processing: FingerprintPayload,
    processing_fingerprint: str,
    canonical_pdf: CanonicalPdf,
    data_root: str | Path,
    created_at: datetime | None,
    warnings: Sequence[str],
    inventory_verified_at: datetime | str,
) -> EvaluationSampleResult:
    if len(selected_records) != len(pages):
        raise PipelineError("selected_records and pages must have equal length")
    selected_pages: list[OcrEvaluationPageRef] = []
    for record, page in zip(selected_records, pages):
        if (
            record.pdfPage != page.sourcePdfPageNumber
            or record.side != page.leafSide
            or record.canonicalSequenceIndex != page.logicalPageNumber
        ):
            raise PipelineError("selected record and page do not correspond")
        selected_pages.append(
            OcrEvaluationPageRef(
                pdfPage=record.pdfPage,
                side=record.side,
                logicalPageNumber=page.logicalPageNumber,
            )
        )
    timestamp = _as_aware_datetime(
        created_at or datetime.now(timezone.utc),
        label="created_at",
    )
    inventory_verified = _as_aware_datetime(
        inventory_verified_at,
        label="inventory_verified_at",
    )
    page_hashes = [_page_artifact_hash(page) for page in pages]
    sample = OcrEvaluationSample.model_construct(
        schemaVersion=1,
        sampleHash="sha256:" + "0" * 64,
        publishable=False,
        metadata=metadata,
        canonicalPdfSha256=canonical_pdf.sha256,
        pageInventorySha256=processing.selection.pageInventorySha256,
        inventoryVerifiedAt=inventory_verified,
        processing=processing,
        processingFingerprint=processing_fingerprint,
        canonicalization=processing.selection.canonicalization,
        selectedPages=selected_pages,
        selectedInventoryRecords=list(selected_records),
        pages=list(pages),
        pageArtifactHashes=page_hashes,
        chunks=list(chunks),
        createdAt=timestamp,
    )
    sample_payload = sample.model_dump(mode="json", by_alias=True, exclude_none=False)
    hash_payload = dict(sample_payload)
    hash_payload.pop("sampleHash")
    hash_payload.pop("createdAt")
    sample_hash = "sha256:" + hashlib.sha256(
        canonical_json_bytes(hash_payload)
    ).hexdigest()
    sample_payload["sampleHash"] = sample_hash
    validated_sample = OcrEvaluationSample.model_validate(sample_payload)
    path = write_evaluation_sample(data_root, validated_sample)
    return EvaluationSampleResult(
        sample=validated_sample,
        path=path,
        warnings=tuple(warnings),
    )


def _ordered_sample_pages(
    selected: Sequence[PageInventoryRecord],
    pages_by_sequence: Mapping[int, SourcePageInput],
) -> tuple[list[SourcePageInput], list[SourcePageInput]]:
    ordered_pages: list[SourcePageInput] = []
    chunk_pages: list[SourcePageInput] = []
    previous_sequence: int | None = None
    for record in selected:
        sequence = record.canonicalSequenceIndex
        if sequence is None:
            raise PipelineError("selected record lacks canonical sequence index")
        page = pages_by_sequence[sequence]
        ordered_pages.append(page)
        if previous_sequence is not None and sequence != previous_sequence + 1:
            if isinstance(page, BaseModel):
                page = page.model_copy(update={"continuityBreakBefore": True})
            else:
                page = copy.copy(page)
                setattr(page, "continuityBreakBefore", True)
        chunk_pages.append(page)
        previous_sequence = sequence
    return ordered_pages, chunk_pages


def prepare_evaluation_sample(
    manifest_path: str | Path,
    refs: Sequence[tuple[int, str]],
    *,
    imports_root: str | Path,
    data_root: str | Path,
    model_cache_root: str | Path,
    created_at: datetime | None = None,
) -> EvaluationSampleResult:
    if not refs:
        raise PipelineError("refs must not be empty")
    if len(refs) > 64:
        raise PipelineError("refs must not exceed 64")
    manifest = load_manifest(manifest_path)
    split_spreads = manifest.selection.splitSpreads
    seen: set[tuple[int, str]] = set()
    for ref in refs:
        if not isinstance(ref, tuple) or len(ref) != 2:
            raise PipelineError("refs must be tuples of (page, side)")
        page, side = ref
        if not isinstance(page, int) or isinstance(page, bool) or not 1 <= page <= 1000:
            raise PipelineError("ref page must be an integer in 1..1000")
        if not split_spreads:
            if side != "full":
                raise PipelineError("side must be 'full'")
        else:
            if side not in {"left", "right"}:
                raise PipelineError("side must be 'left' or 'right'")
        if (page, side) in seen:
            raise PipelineError("refs must not contain duplicates")
        seen.add((page, side))

    data_path = Path(data_root)
    warnings: list[str] = []

    with exclusive_lock(data_path / "locks" / "madoz-prepare.lock"):
        validated = validate_manifest_source(manifest, imports_root)
        if validated.inventory_sha256 is None:
            raise PipelineError("verified page inventory hash is required")
        inventory_sha256 = f"sha256:{validated.inventory_sha256}"
        inventory_payload = validated.inventory_path.read_bytes()
        records = load_verified_inventory(inventory_payload, manifest)
        canonical_pdf = prepare_source(manifest, imports_root, data_path)
        model_lock = load_model_lock(
            model_cache_root,
            manifest.processing.modelLockFile,
        )
        corrections = _load_corrections(manifest, imports_root)
        processing, processing_fingerprint = build_processing_fingerprint(
            manifest,
            canonical_pdf,
            inventory_sha256,
            model_lock,
        )

        records_by_ref: dict[tuple[int, str], PageInventoryRecord] = {}
        for record in records:
            key = (record.pdfPage, record.side)
            if key in records_by_ref:
                continue
            records_by_ref[key] = record

        selected: list[PageInventoryRecord] = []
        for page, side in refs:
            record = records_by_ref.get((page, side))
            if record is None:
                raise PipelineError("ref not found in inventory")
            if record.canonicalStatus == "pending_review":
                raise PipelineError("ref is pending")
            if record.canonicalStatus == "exclude_duplicate":
                raise PipelineError("ref is excluded")
            if record.canonicalStatus != "include":
                raise PipelineError("ref is excluded")
            if record.canonicalSequenceIndex is None:
                raise PipelineError("ref not found in inventory")
            selected.append(record)

        selected.sort(key=lambda record: record.canonicalSequenceIndex)

        pages_by_sequence: dict[int, SourcePageInput] = {}
        missing: list[PageInventoryRecord] = []
        for record in selected:
            sequence = record.canonicalSequenceIndex
            assert sequence is not None
            staged = load_reusable_staged_page(
                data_path,
                manifest.document.documentId,
                sequence,
                processing_fingerprint=processing_fingerprint,
                canonical_pdf_sha256=canonical_pdf.sha256,
                page_inventory_sha256=inventory_sha256,
                on_corrupt=lambda message, number=sequence: warnings.append(
                    f"logical page {number}: {message}"
                ),
            )
            if staged is None:
                missing.append(record)
            else:
                pages_by_sequence[sequence] = staged.page

        metadata = _build_metadata(
            manifest,
            canonical_pdf,
            inventory_sha256,
            processing_fingerprint,
        )

        if missing:
            with open_processor(manifest, canonical_pdf, model_cache_root) as processor:
                for record in missing:
                    sequence = record.canonicalSequenceIndex
                    assert sequence is not None
                    page = processor.process_page(record)
                    staged = _make_staged_page(
                        page,
                        canonical_pdf_sha256=canonical_pdf.sha256,
                        page_inventory_sha256=inventory_sha256,
                        processing_fingerprint=processing_fingerprint,
                    )
                    write_staged_page(data_path, manifest.document.documentId, staged)
                    pages_by_sequence[sequence] = page

        ordered_pages, chunk_pages = _ordered_sample_pages(
            selected, pages_by_sequence
        )
        if corrections is not None:
            corrected_chunk_pages = _apply_corrections(chunk_pages, corrections)
            corrected_by_number = {
                page.logicalPageNumber: page
                for page in corrected_chunk_pages
            }
            ordered_pages = [
                page.model_copy(
                    update={
                        "lines": corrected_by_number[page.logicalPageNumber].lines,
                    }
                )
                for page in ordered_pages
            ]
            chunk_pages = corrected_chunk_pages
        chunks = _build_chunks(manifest, metadata, chunk_pages)

        return _assemble_sample_and_write(
            metadata=metadata,
            selected_records=selected,
            pages=ordered_pages,
            chunks=chunks,
            processing=processing,
            processing_fingerprint=processing_fingerprint,
            canonical_pdf=canonical_pdf,
            data_root=data_path,
            created_at=created_at,
            warnings=warnings,
            inventory_verified_at=manifest.selection.inventoryVerifiedAt,
        )


def prepare_document(
    manifest_path: str | Path,
    *,
    imports_root: str | Path,
    data_root: str | Path,
    model_cache_root: str | Path,
    prepared_at: datetime | None = None,
) -> PreparationResult:
    manifest = load_manifest(manifest_path)
    data_path = Path(data_root)
    warnings: list[str] = []

    with exclusive_lock(data_path / "locks" / "madoz-prepare.lock"):
        validated = validate_manifest_source(manifest, imports_root)
        if validated.inventory_sha256 is None:
            raise PipelineError("verified page inventory hash is required")
        inventory_sha256 = f"sha256:{validated.inventory_sha256}"
        inventory_payload = validated.inventory_path.read_bytes()
        records = load_verified_inventory(inventory_payload, manifest)
        canonical_pdf = prepare_source(manifest, imports_root, data_path)
        model_lock = load_model_lock(
            model_cache_root,
            manifest.processing.modelLockFile,
        )
        corrections = _load_corrections(manifest, imports_root)
        processing, processing_fingerprint = build_processing_fingerprint(
            manifest,
            canonical_pdf,
            inventory_sha256,
            model_lock,
        )

        included = [record for record in records if record.canonicalStatus == "include"]
        if not included:
            raise PipelineError("page inventory contains no included records")
        if any(record.canonicalSequenceIndex is None for record in included):
            raise PipelineError("included inventory record lacks canonical sequence index")
        included.sort(key=lambda record: record.canonicalSequenceIndex)
        if [record.canonicalSequenceIndex for record in included] != list(
            range(1, len(included) + 1)
        ):
            raise PipelineError("included inventory sequence must be contiguous")

        pages_by_sequence: dict[int, SourcePageInput] = {}
        missing: list[PageInventoryRecord] = []
        for record in included:
            sequence = record.canonicalSequenceIndex
            assert sequence is not None
            staged = load_reusable_staged_page(
                data_path,
                manifest.document.documentId,
                sequence,
                processing_fingerprint=processing_fingerprint,
                canonical_pdf_sha256=canonical_pdf.sha256,
                page_inventory_sha256=inventory_sha256,
                on_corrupt=lambda message, number=sequence: warnings.append(
                    f"logical page {number}: {message}"
                ),
            )
            if staged is None:
                missing.append(record)
            else:
                pages_by_sequence[sequence] = staged.page

        metadata = _build_metadata(
            manifest,
            canonical_pdf,
            inventory_sha256,
            processing_fingerprint,
        )
        if missing:
            with open_processor(manifest, canonical_pdf, model_cache_root) as processor:
                for record in missing:
                    sequence = record.canonicalSequenceIndex
                    assert sequence is not None
                    page = processor.process_page(record)
                    staged = _make_staged_page(
                        page,
                        canonical_pdf_sha256=canonical_pdf.sha256,
                        page_inventory_sha256=inventory_sha256,
                        processing_fingerprint=processing_fingerprint,
                    )
                    write_staged_page(data_path, manifest.document.documentId, staged)
                    pages_by_sequence[sequence] = page

        pages = [pages_by_sequence[index] for index in range(1, len(included) + 1)]
        pages = _apply_corrections(pages, corrections)
        chunks = _build_chunks(manifest, metadata, pages)

        return _assemble_and_write(
            manifest=manifest,
            canonical_pdf=canonical_pdf,
            metadata=metadata,
            records=records,
            pages=pages,
            chunks=chunks,
            processing=processing,
            processing_fingerprint=processing_fingerprint,
            data_root=data_path,
            prepared_at=prepared_at,
            warnings=warnings,
        )
