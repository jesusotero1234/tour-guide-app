from __future__ import annotations

import importlib.metadata
import re
import stat
from dataclasses import dataclass
from pathlib import Path

import pymupdf
from pydantic import ValidationError

from .ingest_models import (
    CandidatePdfPageRange,
    CanonicalizationSnapshot,
    ChunkingFingerprint,
    CorrectionFingerprint,
    EmbeddedFirstOcrFingerprint,
    FingerprintPayload,
    FingerprintSelection,
    FingerprintSource,
    LeafGeometryFingerprint,
    LeafOverrideFingerprint,
    ModelLock,
    ModelLockFingerprint,
    OcrFingerprint,
    PolicyFingerprint,
    QualityFingerprint,
    RenderFingerprint,
    SoftwareVersions,
    TableRegionFingerprint,
)
from .manifest import MadozManifest
from .models import NormalizedBox
from .pdf_source import CandidateLeaf, candidate_leaves


_SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_DISTRIBUTIONS = {
    "pymupdf": "PyMuPDF",
    "paddleocr": "paddleocr",
    "paddlex": "paddlex",
    "transformers": "transformers",
    "torch": "torch",
    "numpy": "numpy",
}


class ProcessingFingerprintError(RuntimeError):
    pass


@dataclass(frozen=True)
class CanonicalPdf:
    path: Path
    sha256: str


def _require_sha256(value: str, *, label: str) -> str:
    if not isinstance(value, str) or _SHA256_RE.fullmatch(value) is None:
        raise ProcessingFingerprintError(f"{label} must be sha256:<64 lowercase hex>")
    return value


def _software_versions() -> SoftwareVersions:
    try:
        values = {
            field: importlib.metadata.version(distribution)
            for field, distribution in _DISTRIBUTIONS.items()
        }
        return SoftwareVersions(**values)
    except (importlib.metadata.PackageNotFoundError, ValidationError, ValueError) as exc:
        raise ProcessingFingerprintError("required software version is unavailable") from exc


def _regular_pdf_path(canonical_pdf: CanonicalPdf) -> Path:
    path = Path(canonical_pdf.path)
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise ProcessingFingerprintError("canonical PDF is unavailable") from exc
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise ProcessingFingerprintError("canonical PDF must be a regular non-symlink file")
    try:
        return path.resolve(strict=True)
    except OSError as exc:
        raise ProcessingFingerprintError("canonical PDF cannot be resolved") from exc


def _open_pdf(canonical_pdf: CanonicalPdf) -> pymupdf.Document:
    path = _regular_pdf_path(canonical_pdf)
    try:
        document = pymupdf.open(path)
    except Exception as exc:
        raise ProcessingFingerprintError("canonical PDF is invalid or unreadable") from exc
    if not document.is_pdf:
        document.close()
        raise ProcessingFingerprintError("canonical source is not a PDF")
    if document.needs_pass:
        document.close()
        raise ProcessingFingerprintError("encrypted PDFs are not supported")
    return document


def _normalized_box(values: tuple[float, float, float, float] | list[float]) -> NormalizedBox:
    return NormalizedBox(x0=values[0], y0=values[1], x1=values[2], y1=values[3])


def _leaf_overrides(manifest: MadozManifest) -> tuple[LeafOverrideFingerprint, ...]:
    overrides: list[LeafOverrideFingerprint] = []
    for override in manifest.selection.leafOverrides:
        regions = tuple(
            TableRegionFingerprint(
                box=_normalized_box(region.box),
                ocrRotationDegrees=region.ocrRotationDegrees,
            )
            for region in override.tableRegions
        )
        overrides.append(
            LeafOverrideFingerprint(
                pdfPage=override.pdfPage,
                side=override.side,
                contentClass=override.contentClass,
                rotationDegrees=override.rotationDegrees,
                tableRegions=regions,
            )
        )
    return tuple(overrides)


def _scaled_page_dimensions(page: pymupdf.Page, dpi: int) -> tuple[int, int]:
    rotation = page.rotation
    if rotation not in (0, 90, 180, 270):
        raise ProcessingFingerprintError("unexpected PDF page rotation")
    scale = dpi / 72.0
    pixel_bounds = (page.rect * pymupdf.Matrix(scale, scale)).irect
    width = int(pixel_bounds.width)
    height = int(pixel_bounds.height)
    if width < 1 or height < 1:
        raise ProcessingFingerprintError("PDF page has invalid pixel dimensions")
    return width, height


def _cropped_dimensions(
    full_width: int,
    full_height: int,
    candidate: CandidateLeaf,
) -> tuple[int, int]:
    x0 = max(0, min(full_width, round(candidate.crop_box[0] * full_width)))
    y0 = max(0, min(full_height, round(candidate.crop_box[1] * full_height)))
    x1 = max(0, min(full_width, round(candidate.crop_box[2] * full_width)))
    y1 = max(0, min(full_height, round(candidate.crop_box[3] * full_height)))
    width = x1 - x0
    height = y1 - y0
    if width < 1 or height < 1:
        raise ProcessingFingerprintError("candidate crop is empty")
    if candidate.rotation_degrees in (90, 270):
        width, height = height, width
    return width, height


def _leaf_geometry(
    document: pymupdf.Document,
    manifest: MadozManifest,
) -> tuple[LeafGeometryFingerprint, ...]:
    geometry: list[LeafGeometryFingerprint] = []
    for candidate in candidate_leaves(manifest):
        if candidate.pdf_page > document.page_count:
            raise ProcessingFingerprintError("candidate PDF page is outside the document")
        try:
            page = document.load_page(candidate.pdf_page - 1)
            full_width, full_height = _scaled_page_dimensions(
                page,
                manifest.processing.renderDpi,
            )
        except ProcessingFingerprintError:
            raise
        except Exception as exc:
            raise ProcessingFingerprintError("PDF page geometry cannot be read") from exc
        width, height = _cropped_dimensions(full_width, full_height, candidate)
        geometry.append(
            LeafGeometryFingerprint(
                pdfPage=candidate.pdf_page,
                side=candidate.side,
                cropBox=_normalized_box(candidate.crop_box),
                rotationDegrees=candidate.rotation_degrees,
                widthPx=width,
                heightPx=height,
            )
        )
    return tuple(geometry)


def _validate_inputs(
    manifest: MadozManifest,
    canonical_pdf: CanonicalPdf,
    page_inventory_sha256: str,
) -> None:
    canonical_hash = _require_sha256(canonical_pdf.sha256, label="canonical PDF hash")
    expected_canonical_hash = f"sha256:{manifest.source.expectedSha256}"
    if canonical_hash != expected_canonical_hash:
        raise ProcessingFingerprintError("canonical PDF hash differs from the manifest")

    inventory_hash = _require_sha256(
        page_inventory_sha256,
        label="page inventory hash",
    )
    selection = manifest.selection
    if (
        selection.inventoryReviewStatus != "verified"
        or selection.expectedPageInventorySha256 is None
    ):
        raise ProcessingFingerprintError("page inventory is not verified")
    if inventory_hash != f"sha256:{selection.expectedPageInventorySha256}":
        raise ProcessingFingerprintError("page inventory hash differs from the manifest")


def build_processing_fingerprint(
    manifest: MadozManifest,
    canonical_pdf: CanonicalPdf,
    page_inventory_sha256: str,
    model_lock: ModelLock,
    software_versions: SoftwareVersions | None = None,
) -> tuple[FingerprintPayload, str]:
    _validate_inputs(manifest, canonical_pdf, page_inventory_sha256)
    document = _open_pdf(canonical_pdf)
    try:
        geometry = _leaf_geometry(document, manifest)
    finally:
        document.close()

    selection = manifest.selection
    processing = manifest.processing
    corrections = None
    if processing.corrections is not None:
        corrections = CorrectionFingerprint(
            setRelativePath=processing.corrections.path,
            setSha256=f"sha256:{processing.corrections.expectedSha256}",
            authority=processing.corrections.authority,
            reviewStatus=processing.corrections.reviewStatus,
        )
    if processing.textMode == "ocr":
        ocr_fingerprint = OcrFingerprint(
            textMode=processing.textMode,
            engine=processing.ocrEngine,
            device=processing.device,
            detectionModel=processing.ocrDetectionModel,
            recognitionModel=processing.ocrRecognitionModel,
            language=processing.ocrLanguage,
            documentOrientationClassification=(
                processing.documentOrientationClassification
            ),
            documentUnwarping=processing.documentUnwarping,
            textLineOrientation=processing.textLineOrientation,
        )
    elif processing.textMode == "embedded_first":
        embedded_policy = processing.embeddedPolicy
        embedded_min_characters = processing.embeddedMinCharacters
        embedded_min_alphabetic_ratio = processing.embeddedMinAlphabeticRatio
        embedded_max_token_repetition_ratio = (
            processing.embeddedMaxTokenRepetitionRatio
        )
        if (
            embedded_policy is None
            or embedded_min_characters is None
            or embedded_min_alphabetic_ratio is None
            or embedded_max_token_repetition_ratio is None
        ):
            raise ProcessingFingerprintError(
                "embedded_first fingerprint requires all embedded values"
            )
        ocr_fingerprint = EmbeddedFirstOcrFingerprint(
            textMode=processing.textMode,
            engine=processing.ocrEngine,
            device=processing.device,
            detectionModel=processing.ocrDetectionModel,
            recognitionModel=processing.ocrRecognitionModel,
            language=processing.ocrLanguage,
            documentOrientationClassification=(
                processing.documentOrientationClassification
            ),
            documentUnwarping=processing.documentUnwarping,
            textLineOrientation=processing.textLineOrientation,
            embeddedPolicy=embedded_policy,
            embeddedMinCharacters=embedded_min_characters,
            embeddedMinAlphabeticRatio=embedded_min_alphabetic_ratio,
            embeddedMaxTokenRepetitionRatio=embedded_max_token_repetition_ratio,
        )
    else:
        raise ProcessingFingerprintError("unsupported textMode")
    try:
        payload = FingerprintPayload(
            fingerprintSchemaVersion=1,
            manifestSchemaVersion=manifest.schemaVersion,
            source=FingerprintSource(canonicalPdfSha256=canonical_pdf.sha256),
            selection=FingerprintSelection(
                candidatePdfPageRanges=tuple(
                    CandidatePdfPageRange(start=item.start, end=item.end)
                    for item in selection.candidatePdfPageRanges
                ),
                pageInventorySha256=page_inventory_sha256,
                splitSpreads=selection.splitSpreads,
                gutterRatio=selection.gutterRatio,
                innerGutterTrimRatio=selection.innerGutterTrimRatio,
                canonicalization=CanonicalizationSnapshot.model_validate(
                    selection.canonicalization.model_dump(
                        mode="json",
                        by_alias=True,
                        exclude_none=False,
                    )
                ),
                leafOverrides=_leaf_overrides(manifest),
                leafGeometry=geometry,
            ),
            software=software_versions or _software_versions(),
            render=RenderFingerprint(
                dpi=processing.renderDpi,
                rasterizationPolicy=processing.rasterizationPolicy,
            ),
            ocr=ocr_fingerprint,
            modelLock=ModelLockFingerprint.from_model_lock(model_lock),
            quality=QualityFingerprint(
                lowConfidenceThreshold=processing.lowConfidenceThreshold,
            ),
            policies=PolicyFingerprint(
                layoutPolicy=processing.layoutPolicy,
                entryPolicy=processing.entryPolicy,
            ),
            chunking=ChunkingFingerprint(
                maxChunkChars=processing.maxChunkChars,
                overlapLines=processing.overlapLines,
            ),
            corrections=corrections,
        )
    except (ValidationError, ValueError, TypeError) as exc:
        raise ProcessingFingerprintError("processing fingerprint payload is invalid") from exc
    return payload, payload.fingerprint()
