from __future__ import annotations

import hashlib
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import Protocol

import numpy as np
import pymupdf

from .embedded_text_policy import (
    Reason,
    assess_embedded_text,
)
from .ingest_models import PageInventoryRecord, PreparedChunkInput, QualityFlag, SourcePageInput
from .madoz_chunking import build_prepared_chunks
from .madoz_layout import build_embedded_source_page, build_source_page
from .manifest import MadozManifest, validate_manifest_source
from .models import DocumentMetadata
from .ocr_backend import PpOcrV6Backend
from .pdf_source import (
    RenderedLeaf,
    copy_canonical_pdf,
    embedded_text_lines,
    iter_rendered_leaves,
)
from .processing_fingerprint import CanonicalPdf


class ProcessorError(RuntimeError):
    pass


class _OcrBackend(Protocol):
    def extract_lines(self, image: np.ndarray) -> list[object]: ...

    def close(self) -> None: ...


_RenderPage = Callable[[PageInventoryRecord], RenderedLeaf]
_SIDE_ORDER = {"full": 0, "left": 0, "right": 1}

_REASON_TO_QUALITY_FLAG: dict[Reason, QualityFlag] = {
    "missing_text": "embedded_fallback_missing_text",
    "invalid_box": "embedded_fallback_invalid_box",
    "special_layout": "embedded_fallback_special_layout",
    "too_many_lines": "embedded_fallback_too_many_lines",
    "too_short": "embedded_fallback_too_short",
    "low_alphabetic_ratio": "embedded_fallback_low_alphabetic_ratio",
    "repeated_tokens": "embedded_fallback_repeated_tokens",
}


def prepare_source(
    manifest: MadozManifest,
    imports_root: str | Path,
    data_root: str | Path,
) -> CanonicalPdf:
    validated = validate_manifest_source(manifest, imports_root)
    storage_key = hashlib.sha256(
        manifest.document.documentId.encode("utf-8")
    ).hexdigest()
    destination = (
        Path(data_root)
        / "raw"
        / storage_key
        / f"{manifest.source.expectedSha256}.pdf"
    )
    copied = copy_canonical_pdf(
        validated.pdf_path,
        destination,
        manifest.source.expectedSha256,
    )
    return CanonicalPdf(
        path=Path(copied),
        sha256=f"sha256:{validated.pdf_sha256}",
    )


class MadozProcessor:
    def __init__(
        self,
        manifest: MadozManifest,
        canonical_pdf: CanonicalPdf,
        backend: _OcrBackend | None = None,
        *,
        backend_factory: Callable[[], _OcrBackend] | None = None,
        render_page: _RenderPage | None = None,
    ) -> None:
        expected_sha256 = f"sha256:{manifest.source.expectedSha256}"
        if canonical_pdf.sha256 != expected_sha256:
            raise ProcessorError("canonical PDF hash does not match manifest")
        if (backend is None) == (backend_factory is None):
            raise ProcessorError("exactly one of backend or backend_factory must be provided")
        if backend is not None:
            self._validate_backend(backend)
        self._manifest = manifest
        self._canonical_pdf = canonical_pdf
        self._backend = backend
        self._backend_factory = backend_factory
        self._render_page = render_page
        self._rendered_iterator: Iterator[RenderedLeaf] | None = None
        self._closed = False

    @staticmethod
    def _validate_backend(backend: _OcrBackend) -> None:
        if not callable(getattr(backend, "extract_lines", None)):
            raise ProcessorError("OCR backend must expose extract_lines")
        if not callable(getattr(backend, "close", None)):
            raise ProcessorError("OCR backend must expose close")

    def _get_backend(self) -> _OcrBackend:
        if self._backend is None:
            if self._backend_factory is None:
                raise ProcessorError("backend factory is required when backend is not injected")
            created_backend = self._backend_factory()
            self._validate_backend(created_backend)
            self._backend = created_backend
            self._backend_factory = None
        return self._backend

    @staticmethod
    def _record_key(record: PageInventoryRecord) -> tuple[int, int]:
        return (record.pdfPage, _SIDE_ORDER[record.side])

    @staticmethod
    def _rendered_key(rendered: RenderedLeaf) -> tuple[int, int]:
        candidate = rendered.candidate
        return (candidate.pdf_page, _SIDE_ORDER[candidate.side])

    def _default_render(self, record: PageInventoryRecord) -> RenderedLeaf:
        if self._rendered_iterator is None:
            self._rendered_iterator = iter(
                iter_rendered_leaves(self._canonical_pdf.path, self._manifest)
            )
        target = self._record_key(record)
        for rendered in self._rendered_iterator:
            current = self._rendered_key(rendered)
            if current == target:
                return rendered
            if current > target:
                raise ProcessorError("rendered leaves passed the requested inventory page")
        raise ProcessorError("inventory page has no rendered leaf")

    def _render(self, record: PageInventoryRecord) -> RenderedLeaf:
        rendered = (
            self._render_page(record)
            if self._render_page is not None
            else self._default_render(record)
        )
        if not isinstance(rendered, RenderedLeaf):
            raise ProcessorError("renderer must return RenderedLeaf")
        candidate = rendered.candidate
        if candidate.pdf_page != record.pdfPage or candidate.side != record.side:
            raise ProcessorError("rendered leaf does not match inventory record")
        return rendered

    @staticmethod
    def _rgb_image(rendered: RenderedLeaf) -> np.ndarray:
        expected_bytes = rendered.width_px * rendered.height_px * 3
        if len(rendered.rgb_bytes) != expected_bytes:
            raise ProcessorError("rendered RGB byte length is inconsistent")
        return np.frombuffer(rendered.rgb_bytes, dtype=np.uint8).reshape(
            rendered.height_px,
            rendered.width_px,
            3,
        )

    @staticmethod
    def _rotated_region_image(
        image: np.ndarray,
        rendered: RenderedLeaf,
        region_index: int,
    ) -> np.ndarray:
        region = rendered.candidate.table_regions[region_index]
        x0 = max(0, min(rendered.width_px, round(region.box[0] * rendered.width_px)))
        y0 = max(0, min(rendered.height_px, round(region.box[1] * rendered.height_px)))
        x1 = max(0, min(rendered.width_px, round(region.box[2] * rendered.width_px)))
        y1 = max(0, min(rendered.height_px, round(region.box[3] * rendered.height_px)))
        if x1 <= x0 or y1 <= y0:
            raise ProcessorError("rotated table region crop is empty")
        crop = image[y0:y1, x0:x1]
        rotation = region.ocrRotationDegrees
        if rotation == 90:
            return np.ascontiguousarray(np.rot90(crop, k=3))
        if rotation == 270:
            return np.ascontiguousarray(np.rot90(crop, k=1))
        raise ProcessorError("rotated table region must use 90 or 270 degrees")

    def process_page(self, inventory_record: PageInventoryRecord) -> SourcePageInput:
        if self._closed:
            raise ProcessorError("processor is closed")
        if (
            not isinstance(inventory_record, PageInventoryRecord)
            or inventory_record.canonicalStatus != "include"
            or inventory_record.canonicalSequenceIndex is None
        ):
            raise ProcessorError("processor accepts only include inventory records")

        rendered = self._render(inventory_record)

        additional_quality_flags: list[QualityFlag] = []
        if self._manifest.processing.textMode == "embedded_first":
            min_characters = self._manifest.processing.embeddedMinCharacters
            min_alphabetic_ratio = self._manifest.processing.embeddedMinAlphabeticRatio
            max_token_repetition_ratio = self._manifest.processing.embeddedMaxTokenRepetitionRatio
            if (
                min_characters is None
                or min_alphabetic_ratio is None
                or max_token_repetition_ratio is None
            ):
                raise ProcessorError(
                    "embedded_first requires embeddedMinCharacters, "
                    "embeddedMinAlphabeticRatio, and embeddedMaxTokenRepetitionRatio"
                )
            embedded_lines = embedded_text_lines(rendered.embedded_words)
            candidate_rotation = rendered.candidate.rotation_degrees
            content_class: str = (
                "mixed_orientation"
                if candidate_rotation != 0 or rendered.candidate.table_regions
                else rendered.candidate.content_class
            )
            decision = assess_embedded_text(
                embedded_lines,
                content_class=content_class,  # type: ignore[arg-type]
                min_characters=min_characters,
                min_alphabetic_ratio=min_alphabetic_ratio,
                max_token_repetition_ratio=max_token_repetition_ratio,
            )
            if decision.accepted:
                return build_embedded_source_page(
                    self._manifest,
                    inventory_record,
                    rendered,
                    embedded_lines,
                    confidence=decision.quality_score,
                    pymupdf_version=pymupdf.__version__,
                )
            fallback_flag = _REASON_TO_QUALITY_FLAG.get(decision.reason)
            if fallback_flag is None:
                raise ProcessorError(
                    f"no QualityFlag mapping for embedded rejection reason {decision.reason!r}"
                )
            additional_quality_flags = [fallback_flag]

        image = self._rgb_image(rendered)
        backend = self._get_backend()
        primary_lines = backend.extract_lines(image)
        rotated_table_lines: dict[int, Sequence[object]] = {}
        for index, region in enumerate(rendered.candidate.table_regions):
            if region.ocrRotationDegrees is None:
                continue
            rotated_image = self._rotated_region_image(image, rendered, index)
            rotated_table_lines[index] = backend.extract_lines(rotated_image)

        return build_source_page(
            self._manifest,
            inventory_record,
            rendered,
            primary_lines,  # type: ignore[arg-type]
            rotated_table_lines=rotated_table_lines,  # type: ignore[arg-type]
            additional_quality_flags=additional_quality_flags,
        )

    def build_chunks(
        self,
        metadata: DocumentMetadata,
        ordered_pages: Sequence[SourcePageInput],
    ) -> list[PreparedChunkInput]:
        if self._closed:
            raise ProcessorError("processor is closed")
        return build_prepared_chunks(
            metadata,
            ordered_pages,
            self._manifest.processing.maxChunkChars,
            self._manifest.processing.overlapLines,
        )

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        first_error: BaseException | None = None
        iterator = self._rendered_iterator
        self._rendered_iterator = None
        if iterator is not None:
            close_iterator = getattr(iterator, "close", None)
            if callable(close_iterator):
                try:
                    close_iterator()
                except BaseException as exc:
                    first_error = exc
        if self._backend is not None:
            try:
                self._backend.close()
            except BaseException as exc:
                if first_error is None:
                    first_error = exc
        if first_error is not None:
            raise ProcessorError("processor resources failed to close") from first_error


@contextmanager
def open_processor(
    manifest: MadozManifest,
    canonical_pdf: CanonicalPdf,
    model_cache_root: str | Path,
) -> Iterator[MadozProcessor]:
    backend: _OcrBackend | None = None
    processor: MadozProcessor | None = None
    try:
        if manifest.processing.textMode == "ocr":
            backend = PpOcrV6Backend.open(
                model_cache_root,
                manifest.processing.modelLockFile,
            )
            processor = MadozProcessor(manifest, canonical_pdf, backend)
        else:
            def backend_factory() -> _OcrBackend:
                return PpOcrV6Backend.open(
                    model_cache_root,
                    manifest.processing.modelLockFile,
                )
            processor = MadozProcessor(
                manifest,
                canonical_pdf,
                backend_factory=backend_factory,
            )
        yield processor
    finally:
        if processor is not None:
            processor.close()
        elif backend is not None:
            backend.close()
