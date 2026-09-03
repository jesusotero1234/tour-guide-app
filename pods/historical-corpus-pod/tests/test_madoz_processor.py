from __future__ import annotations

import hashlib
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from historical_corpus.ingest_models import ExtractedLineCandidate
from historical_corpus.madoz_processor import (
    MadozProcessor,
    ProcessorError,
    open_processor,
    prepare_source,
)
from historical_corpus.manifest import MadozManifest, ManifestTableRegion
from historical_corpus.processing_fingerprint import CanonicalPdf
from historical_corpus.pdf_source import EmbeddedWord
from test_madoz_chunking import _line as _chunk_line
from test_madoz_chunking import _metadata as _chunk_metadata
from test_madoz_chunking import _page as _chunk_page
from test_madoz_layout import _embedded_manifest, _inventory, _line, _manifest, _rendered


class FakeBackend:
    def __init__(self, results: list[object] | None = None) -> None:
        self.results = list(results or [])
        self.images: list[np.ndarray] = []
        self.c_contiguous_flags: list[bool] = []
        self.close_calls = 0

    def extract_lines(self, image: np.ndarray) -> list[ExtractedLineCandidate]:
        self.c_contiguous_flags.append(bool(image.flags.c_contiguous))
        self.images.append(image.copy())
        result = self.results.pop(0) if self.results else []
        if isinstance(result, BaseException):
            raise result
        return list(result)  # type: ignore[arg-type]

    def close(self) -> None:
        self.close_calls += 1


def _canonical_pdf(manifest: MadozManifest) -> CanonicalPdf:
    return CanonicalPdf(
        path=Path("/data/raw/test.pdf"),
        sha256="sha256:" + manifest.source.expectedSha256,
    )


def _rotated_manifest(rotation: int) -> MadozManifest:
    payload = _manifest().model_dump(mode="json", by_alias=True, exclude_none=False)
    payload["selection"]["leafOverrides"] = [  # type: ignore[index]
        {
            "pdfPage": 1,
            "side": "full",
            "contentClass": "mixed_orientation",
            "rotationDegrees": 0,
            "tableRegions": [
                {
                    "box": [0.2, 0.25, 0.8, 0.75],
                    "ocrRotationDegrees": rotation,
                }
            ],
        }
    ]
    return MadozManifest.model_validate(payload)


def test_prepare_source_verifies_and_copies_to_the_canonical_raw_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manifest = _manifest()
    source = tmp_path / "imports" / "source.pdf"
    copied: list[tuple[Path, Path, str]] = []
    monkeypatch.setattr(
        "historical_corpus.madoz_processor.validate_manifest_source",
        lambda actual, root: SimpleNamespace(
            pdf_path=source,
            pdf_sha256=actual.source.expectedSha256,
        ),
    )

    def fake_copy(origin: Path, destination: Path, expected: str) -> Path:
        copied.append((origin, destination, expected))
        return destination

    monkeypatch.setattr(
        "historical_corpus.madoz_processor.copy_canonical_pdf",
        fake_copy,
    )

    canonical = prepare_source(manifest, tmp_path / "imports", tmp_path / "data")
    storage_key = hashlib.sha256(manifest.document.documentId.encode()).hexdigest()
    expected_path = (
        tmp_path
        / "data"
        / "raw"
        / storage_key
        / f"{manifest.source.expectedSha256}.pdf"
    )
    assert copied == [(source, expected_path, manifest.source.expectedSha256)]
    assert canonical == CanonicalPdf(
        path=expected_path,
        sha256="sha256:" + manifest.source.expectedSha256,
    )


def test_open_processor_uses_one_backend_and_closes_on_all_exits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manifest = _manifest()
    opened: list[tuple[Path, str]] = []
    backends: list[FakeBackend] = []

    def fake_open(root: Path, lock_file: str) -> FakeBackend:
        opened.append((root, lock_file))
        backend = FakeBackend()
        backends.append(backend)
        return backend

    monkeypatch.setattr(
        "historical_corpus.madoz_processor.PpOcrV6Backend.open",
        fake_open,
    )
    model_root = Path("/model-cache/paddlex")

    with open_processor(manifest, _canonical_pdf(manifest), model_root) as processor:
        assert isinstance(processor, MadozProcessor)
    assert backends[0].close_calls == 1

    with pytest.raises(RuntimeError, match="body failed"):
        with open_processor(manifest, _canonical_pdf(manifest), model_root):
            raise RuntimeError("body failed")
    assert backends[1].close_calls == 1
    assert opened == [
        (model_root, manifest.processing.modelLockFile),
        (model_root, manifest.processing.modelLockFile),
    ]


def test_process_page_rejects_non_include_before_render_or_ocr() -> None:
    manifest = _manifest()
    backend = FakeBackend()
    render_calls: list[object] = []
    processor = MadozProcessor(
        manifest,
        _canonical_pdf(manifest),
        backend,
        render_page=lambda record: render_calls.append(record),  # type: ignore[arg-type,return-value]
    )
    with pytest.raises(ProcessorError, match="include"):
        processor.process_page(
            _inventory(status="exclude_nonbody", logical_page=None)
        )
    assert render_calls == []
    assert backend.images == []


def test_normal_and_blank_pages_use_only_primary_ocr_and_ignore_embedded_text() -> None:
    manifest = _manifest()
    line = _line("MALAGA: OCR", (0.1, 0.2, 0.4, 0.3))
    rendered = replace(
        _rendered(),
        embedded_words=(EmbeddedWord(text="EMBEDDED WRONG", box=(1, 1, 2, 2)),),
    )
    backend = FakeBackend([[line], []])
    renders = [rendered, _rendered()]
    processor = MadozProcessor(
        manifest,
        _canonical_pdf(manifest),
        backend,
        render_page=lambda _record: renders.pop(0),
    )

    page = processor.process_page(_inventory())
    assert page.originalText == "MALAGA: OCR"
    assert "EMBEDDED" not in page.originalText
    assert len(backend.images) == 1
    assert backend.images[0].shape == (100, 100, 3)

    blank = processor.process_page(_inventory())
    assert blank.lines == []
    assert blank.originalText == ""
    assert blank.meanConfidence == 1.0
    assert blank.lowConfidenceRatio == 0.0
    assert blank.qualityScore == 1.0
    assert blank.qualityFlags == ["blank"]


@pytest.mark.parametrize("rotation", [90, 270])
def test_rotated_table_region_gets_one_clockwise_second_pass_and_replacement(
    rotation: int,
) -> None:
    manifest = _rotated_manifest(rotation)
    region = ManifestTableRegion(
        box=[0.2, 0.25, 0.8, 0.75],
        ocrRotationDegrees=rotation,
    )
    image = np.arange(60 * 100 * 3, dtype=np.uint8).reshape(60, 100, 3)
    rendered = _rendered(
        width=100,
        height=60,
        rgb=image.tobytes(),
        content_class="mixed_orientation",
        table_regions=(region,),
    )
    primary_inside_region = _line(
        "PRIMARY MUST GO",
        (0.3, 0.3, 0.7, 0.4),
        width=100,
        height=60,
    )
    rotated_replacement = _line(
        "ROTATED TABLE",
        (0.1, 0.1, 0.9, 0.2),
        width=30,
        height=60,
    )
    backend = FakeBackend([[primary_inside_region], [rotated_replacement]])
    processor = MadozProcessor(
        manifest,
        _canonical_pdf(manifest),
        backend,
        render_page=lambda _record: rendered,
    )

    page = processor.process_page(_inventory())
    crop = image[15:45, 20:80]
    expected_rotated = np.rot90(crop, k=3 if rotation == 90 else 1)
    assert len(backend.images) == 2
    assert backend.c_contiguous_flags == [True, True]
    assert np.array_equal(backend.images[0], image)
    assert np.array_equal(backend.images[1], expected_rotated)
    assert [line.originalText for line in page.lines] == ["ROTATED TABLE"]
    assert page.lines[0].role == "table"


def test_ocr_failure_produces_no_page_and_context_still_closes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manifest = _manifest()
    backend = FakeBackend([RuntimeError("OCR failed")])
    monkeypatch.setattr(
        "historical_corpus.madoz_processor.PpOcrV6Backend.open",
        lambda _root, _lock: backend,
    )
    monkeypatch.setattr(
        "historical_corpus.madoz_processor.iter_rendered_leaves",
        lambda _path, _manifest: iter([_rendered()]),
    )

    with pytest.raises(RuntimeError, match="OCR failed"):
        with open_processor(manifest, _canonical_pdf(manifest), Path("/models")) as processor:
            processor.process_page(_inventory())
    assert backend.close_calls == 1


def test_embedded_first_processor_uses_embedded_text_and_skips_ocr() -> None:
    manifest = _embedded_manifest()
    prose = "The quick brown fox jumps over the lazy dog"
    rendered = replace(
        _rendered(),
        embedded_words=(EmbeddedWord(text=prose, box=(0.1, 0.1, 0.9, 0.2)),),
    )
    backend = FakeBackend()
    processor = MadozProcessor(
        manifest,
        _canonical_pdf(manifest),
        backend,
        render_page=lambda _record: rendered,
    )

    page = processor.process_page(_inventory())
    assert page.originalText == prose
    assert page.textSource == "embedded"
    assert backend.images == []


def test_embedded_first_special_layout_contrast_falls_back_to_ocr() -> None:
    manifest = _embedded_manifest()
    prose = "The quick brown fox jumps over the lazy dog"
    rendered = replace(
        _rendered(content_class="table"),
        embedded_words=(EmbeddedWord(text=prose, box=(0.1, 0.1, 0.9, 0.2)),),
    )
    backend = FakeBackend([[_line("OCR TABLE", (0.1, 0.2, 0.4, 0.3))]])
    processor = MadozProcessor(
        manifest,
        _canonical_pdf(manifest),
        backend,
        render_page=lambda _record: rendered,
    )

    page = processor.process_page(_inventory())
    assert len(backend.images) == 1
    assert page.textSource == "ppocrv6"
    assert page.originalText == "OCR TABLE"
    assert "embedded_fallback_special_layout" in page.qualityFlags


def test_embedded_first_lazy_backend_open_and_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manifest = _embedded_manifest()
    open_calls: list[tuple[Path, str]] = []
    backend = FakeBackend([[_line("OCR FALLBACK", (0.1, 0.2, 0.4, 0.3))]])

    def fake_open(root: Path, lock_file: str) -> FakeBackend:
        open_calls.append((root, lock_file))
        return backend

    monkeypatch.setattr(
        "historical_corpus.madoz_processor.PpOcrV6Backend.open",
        fake_open,
    )

    healthy = replace(
        _rendered(),
        embedded_words=(
            EmbeddedWord(
                text="HEALTHY EMBEDDED TEXT LAYER",
                box=(0.1, 0.1, 0.9, 0.2),
            ),
        ),
    )
    no_text = _rendered()
    rendered_pages = [healthy, no_text]

    monkeypatch.setattr(
        "historical_corpus.madoz_processor.iter_rendered_leaves",
        lambda _path, _manifest: iter(rendered_pages),
    )

    model_root = Path("/model-cache/paddlex")
    with open_processor(manifest, _canonical_pdf(manifest), model_root) as processor:
        page_one = processor.process_page(_inventory())
        assert page_one.originalText == "HEALTHY EMBEDDED TEXT LAYER"
        assert page_one.textSource == "embedded"
        assert open_calls == []

        page_two = processor.process_page(_inventory())
        assert open_calls == [(model_root, manifest.processing.modelLockFile)]
        assert len(backend.images) == 1
        assert page_two.textSource == "ppocrv6"
        assert page_two.originalText == "OCR FALLBACK"
        assert "embedded_fallback_missing_text" in page_two.qualityFlags

    assert backend.close_calls == 1


def test_build_chunks_delegates_limits_breaks_roles_and_is_deterministic() -> None:
    manifest = _manifest(max_chunk_chars=256)
    processor = MadozProcessor(
        manifest,
        _canonical_pdf(manifest),
        FakeBackend(),
        render_page=lambda _record: _rendered(),
    )
    title = _chunk_line(1, 0, "MALAGA: entrada")
    header = _chunk_line(1, 1, "cabecera", role="header")
    page_one = _chunk_page(1, [title, header])
    page_two = _chunk_page(
        2,
        [_chunk_line(2, 0, "continuación sin título")],
        break_before=True,
    )

    forward = processor.build_chunks(_chunk_metadata(), [page_one, page_two])
    replay = processor.build_chunks(_chunk_metadata(), [page_two, page_one])
    assert [item.model_dump(mode="json") for item in forward] == [
        item.model_dump(mode="json") for item in replay
    ]
    assert len(forward) == 1
    assert forward[0].lineIds == [title.lineId]
    assert "cabecera" not in forward[0].originalText
