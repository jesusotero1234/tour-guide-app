from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

import pymupdf
import pytest

from historical_corpus.manifest import MadozManifest
from historical_corpus.pdf_source import (
    CandidateLeaf,
    PdfSourceError,
    RenderedLeaf,
    candidate_leaves,
    clear_sha_verification_cache,
    copy_canonical_pdf,
    crop_box_for_side,
    dhash64,
    iter_rendered_leaves,
    render_preview,
    sha_verification_cache_info,
    verify_pdf_sha256,
)


def _manifest(
    *,
    ranges: list[dict[str, int]] | None = None,
    split: bool = False,
    render_dpi: int = 150,
    leaf_overrides: list[dict[str, object]] | None = None,
) -> MadozManifest:
    return MadozManifest.model_validate(
        {
            "schemaVersion": 1,
            "document": {
                "documentId": "madoz-test",
                "workId": "madoz-work",
                "title": "Diccionario geográfico",
                "author": "Pascual Madoz",
                "edition": "Tomo XI",
                "volumeNumber": 11,
                "publicationYear": 1848,
                "language": "es",
                "countryCode": "ES",
                "sourceClass": "primary_historical",
                "historicalPeriod": "1848",
                "temporalScope": "España, siglo XIX",
            },
            "source": {
                "pdfPath": "source.pdf",
                "sourceUrl": "https://example.org/record",
                "isExactRecord": True,
                "repositoryName": "Example Repository",
                "expectedSha256": "0" * 64,
                "attribution": "Example scan",
                "rights": {
                    "status": "pending_intended_use_review",
                    "uri": "https://example.org/rights",
                    "verifiedAt": "2026-09-02T00:00:00+02:00",
                    "isExplicitlyReusable": False,
                },
            },
            "selection": {
                "candidatePdfPageRanges": ranges or [{"start": 1, "end": 1}],
                "pageInventoryPath": "inventory/pages.jsonl",
                "expectedPageInventorySha256": None,
                "inventoryReviewStatus": "pending",
                "inventoryVerifiedAt": None,
                "canonicalization": {
                    "defaultStatus": "include",
                    "defaultOrder": "source_order",
                    "duplicateDecisions": [],
                    "pageOverrides": [],
                },
                "splitSpreads": split,
                "gutterRatio": 0.5,
                "innerGutterTrimRatio": 0.005,
                "leafOverrides": leaf_overrides or [],
            },
            "coverage": {
                "status": "unknown",
                "statement": None,
                "observedPrintedRanges": [],
                "missingPrintedPages": [],
                "acceptedForProduct": False,
                "acceptedAt": None,
            },
            "processing": {
                "textMode": "ocr",
                "renderDpi": render_dpi,
                "rasterizationPolicy": "pymupdf-page-render-v1",
                "ocrEngine": "transformers",
                "ocrDetectionModel": "PP-OCRv6_medium_det",
                "ocrRecognitionModel": "PP-OCRv6_medium_rec",
                "ocrLanguage": "es",
                "device": "cpu",
                "modelLockFile": "ppocrv6-medium-transformers/model-lock.json",
                "documentOrientationClassification": False,
                "documentUnwarping": False,
                "textLineOrientation": True,
                "lowConfidenceThreshold": 0.6,
                "maxChunkChars": 1500,
                "overlapLines": 2,
                "layoutPolicy": "madoz-two-column-v1",
                "entryPolicy": "madoz-entry-v1",
            },
        }
    )


def _pdf(path: Path, *, pages: int = 1, rotation: int = 0) -> Path:
    document = pymupdf.open()
    for page_number in range(pages):
        page = document.new_page(width=216, height=72)
        page.insert_text((12, 36), f"Madoz pagina {page_number + 1}")
        if rotation:
            page.set_rotation(rotation)
    document.save(path)
    document.close()
    return path


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_copy_canonical_pdf_is_verified_atomic_and_idempotent(tmp_path: Path) -> None:
    source = _pdf(tmp_path / "source.pdf")
    destination = tmp_path / "canonical" / "madoz.pdf"
    expected = _sha256(source)

    assert copy_canonical_pdf(source, destination, expected) == destination
    assert destination.read_bytes() == source.read_bytes()
    assert not list(destination.parent.glob(f".{destination.name}.tmp-*"))

    before = destination.stat().st_mtime_ns
    assert copy_canonical_pdf(source, destination, expected) == destination
    assert destination.stat().st_mtime_ns == before


def test_copy_canonical_pdf_never_publishes_unexpected_bytes(tmp_path: Path) -> None:
    source = _pdf(tmp_path / "source.pdf")
    destination = tmp_path / "canonical.pdf"

    with pytest.raises(PdfSourceError, match="source.*SHA-256"):
        copy_canonical_pdf(source, destination, "f" * 64)
    assert not destination.exists()

    destination.write_bytes(b"preserve me")
    with pytest.raises(PdfSourceError, match="destination.*different"):
        copy_canonical_pdf(source, destination, _sha256(source))
    assert destination.read_bytes() == b"preserve me"


def test_sha_verification_cache_is_bounded_and_stat_sensitive(tmp_path: Path) -> None:
    source = _pdf(tmp_path / "source.pdf")
    expected = _sha256(source)
    clear_sha_verification_cache()

    verify_pdf_sha256(source, expected)
    verify_pdf_sha256(source, expected)
    first = sha_verification_cache_info()
    assert first.maxsize == 16
    assert first.misses == 1
    assert first.hits == 1

    stat = source.stat()
    os.utime(source, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))
    verify_pdf_sha256(source, expected)
    assert sha_verification_cache_info().misses == 2

    with pytest.raises(PdfSourceError, match="SHA-256"):
        verify_pdf_sha256(source, "f" * 64)


def test_candidate_leaves_follow_ranges_split_and_overrides() -> None:
    unsplit = candidate_leaves(
        _manifest(ranges=[{"start": 1, "end": 2}, {"start": 4, "end": 4}])
    )
    assert [(leaf.pdf_page, leaf.side) for leaf in unsplit] == [
        (1, "full"),
        (2, "full"),
        (4, "full"),
    ]
    assert all(not hasattr(leaf, "logical_page_number") for leaf in unsplit)

    split = candidate_leaves(
        _manifest(
            ranges=[{"start": 2, "end": 2}],
            split=True,
            leaf_overrides=[
                {
                    "pdfPage": 2,
                    "side": "right",
                    "contentClass": "table",
                    "rotationDegrees": 90,
                    "tableRegions": [
                        {"box": [0.1, 0.2, 0.8, 0.9], "ocrRotationDegrees": 270}
                    ],
                }
            ],
        )
    )
    assert [(leaf.pdf_page, leaf.side) for leaf in split] == [(2, "left"), (2, "right")]
    assert split[0].crop_box == (0.0, 0.0, 0.495, 1.0)
    assert split[1].crop_box == (0.505, 0.0, 1.0, 1.0)
    assert split[1].rotation_degrees == 90
    assert split[1].content_class == "table"
    assert split[1].table_regions[0].ocrRotationDegrees == 270


def test_crop_boxes_use_only_the_explicit_gutter_trim() -> None:
    assert crop_box_for_side("full", 0.51, 0.01) == (0.0, 0.0, 1.0, 1.0)
    assert crop_box_for_side("left", 0.51, 0.01) == (0.0, 0.0, 0.5, 1.0)
    assert crop_box_for_side("right", 0.51, 0.01) == (0.52, 0.0, 1.0, 1.0)


def test_rendered_leaves_are_rgb_ordered_and_contain_diagnostics(tmp_path: Path) -> None:
    source = _pdf(tmp_path / "source.pdf", pages=2)
    manifest = _manifest(
        ranges=[{"start": 1, "end": 2}],
        split=True,
        render_dpi=150,
        leaf_overrides=[
            {
                "pdfPage": 2,
                "side": "right",
                "contentClass": "normal",
                "rotationDegrees": 90,
                "tableRegions": [],
            }
        ],
    )

    rendered = list(iter_rendered_leaves(source, manifest))
    assert [(item.candidate.pdf_page, item.candidate.side) for item in rendered] == [
        (1, "left"),
        (1, "right"),
        (2, "left"),
        (2, "right"),
    ]
    assert all(isinstance(item, RenderedLeaf) for item in rendered)
    assert all(len(item.rgb_bytes) == item.width_px * item.height_px * 3 for item in rendered)
    assert all(item.render_dpi == 150 for item in rendered)
    assert all(item.rasterization_policy == "pymupdf-page-render-v1" for item in rendered)
    assert all(re.fullmatch(r"[0-9a-f]{64}", item.image_sha256) for item in rendered)
    assert all(re.fullmatch(r"[0-9a-f]{16}", item.visual_dhash64) for item in rendered)
    assert not any(hasattr(item, "pixmap") for item in rendered)
    assert rendered[2].width_px > rendered[2].height_px
    assert rendered[3].width_px < rendered[3].height_px
    assert any(word.text == "Madoz" for word in rendered[0].embedded_words)
    assert not any(hasattr(item, "original_text") for item in rendered)


def test_intrinsic_rotation_precedes_crop_and_manual_rotation(tmp_path: Path) -> None:
    source = _pdf(tmp_path / "rotated.pdf", rotation=90)
    normal = list(iter_rendered_leaves(source, _manifest(render_dpi=150)))[0]
    manual = list(
        iter_rendered_leaves(
            source,
            _manifest(
                render_dpi=150,
                leaf_overrides=[
                    {
                        "pdfPage": 1,
                        "side": "full",
                        "contentClass": "normal",
                        "rotationDegrees": 90,
                        "tableRegions": [],
                    }
                ],
            ),
        )
    )[0]

    assert normal.width_px < normal.height_px
    assert manual.width_px == normal.height_px
    assert manual.height_px == normal.width_px
    assert manual.image_sha256 != normal.image_sha256
    assert normal.media_box == (0.0, 0.0, 216.0, 72.0)
    assert normal.pdf_rotation_degrees == 90


def test_invalid_and_encrypted_pdfs_are_rejected(tmp_path: Path) -> None:
    invalid = tmp_path / "invalid.pdf"
    invalid.write_bytes(b"not a pdf")
    with pytest.raises(PdfSourceError, match="PDF"):
        list(iter_rendered_leaves(invalid, _manifest()))

    document = pymupdf.open()
    document.new_page()
    encrypted = tmp_path / "encrypted.pdf"
    document.save(
        encrypted,
        encryption=pymupdf.PDF_ENCRYPT_AES_256,
        owner_pw="owner",
        user_pw="secret",
    )
    document.close()
    with pytest.raises(PdfSourceError, match="encrypted"):
        list(iter_rendered_leaves(encrypted, _manifest()))


def test_dominant_raster_metadata_uses_largest_pixel_area(tmp_path: Path) -> None:
    document = pymupdf.open()
    page = document.new_page(width=216, height=72)
    small = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 8, 8), False)
    small.clear_with(0xFF0000)
    large = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 20, 10), False)
    large.clear_with(0x00FF00)
    page.insert_image(pymupdf.Rect(0, 0, 50, 50), stream=small.tobytes("png"))
    page.insert_image(pymupdf.Rect(60, 0, 160, 50), stream=large.tobytes("png"))
    source = tmp_path / "rasters.pdf"
    document.save(source)
    document.close()

    raster = list(iter_rendered_leaves(source, _manifest()))[0].dominant_raster
    assert raster is not None
    assert (raster.width_px, raster.height_px) == (20, 10)
    assert raster.bits_per_component == 8
    assert raster.filter is None or isinstance(raster.filter, str)
    assert raster.declared_dpi_x is None or raster.declared_dpi_x > 0
    assert raster.declared_dpi_y is None or raster.declared_dpi_y > 0

    vector_only = _pdf(tmp_path / "vector.pdf")
    assert list(iter_rendered_leaves(vector_only, _manifest()))[0].dominant_raster is None


def test_copy_canonical_pdf_rejects_symlinks(tmp_path: Path) -> None:
    source = _pdf(tmp_path / "source.pdf")
    expected = _sha256(source)

    source_symlink = tmp_path / "source_link.pdf"
    source_symlink.symlink_to(source)
    destination = tmp_path / "canonical.pdf"
    with pytest.raises(PdfSourceError, match="symlink"):
        copy_canonical_pdf(source_symlink, destination, expected)
    assert not destination.exists()

    sentinel = tmp_path / "sentinel.bin"
    sentinel.write_bytes(b"sentinel-bytes")
    destination_symlink = tmp_path / "canonical_link.pdf"
    destination_symlink.symlink_to(sentinel)
    with pytest.raises(PdfSourceError, match="symlink"):
        copy_canonical_pdf(source, destination_symlink, expected)
    assert sentinel.read_bytes() == b"sentinel-bytes"


def test_dhash_and_preview_are_deterministic(tmp_path: Path) -> None:
    pixels = bytes(channel for _row in range(8) for value in range(9) for channel in (value * 28,) * 3)
    first = dhash64(pixels, width=9, height=8)
    assert first == dhash64(pixels, width=9, height=8)
    assert re.fullmatch(r"[0-9a-f]{16}", first)

    source = _pdf(tmp_path / "source.pdf")
    manifest = _manifest(split=True, render_dpi=300)
    candidate = candidate_leaves(manifest)[0]
    preview = render_preview(source, candidate)
    assert preview.render_dpi == 144
    assert preview.candidate == candidate
    assert preview.width_px == 214
    assert preview.height_px == 144
    assert manifest.processing.renderDpi == 300
