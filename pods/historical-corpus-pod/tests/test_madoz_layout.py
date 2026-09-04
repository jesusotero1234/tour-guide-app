from __future__ import annotations

from itertools import permutations

import numpy as np
import pytest

from historical_corpus.identity import compute_line_id, compute_page_id
from historical_corpus.ingest_models import ExtractedLineCandidate, PageInventoryRecord
from historical_corpus.madoz_layout import (
    LayoutError,
    build_embedded_source_page,
    build_source_page,
)
from historical_corpus.manifest import MadozManifest, ManifestTableRegion
from historical_corpus.models import NormalizedBox
from historical_corpus.pdf_source import CandidateLeaf, EmbeddedTextLine, RenderedLeaf


def _embedded_manifest() -> MadozManifest:
    values = _manifest().model_dump()
    values["processing"].update(
        {
            "textMode": "embedded_first",
            "embeddedPolicy": "madoz-embedded-v1",
            "embeddedMinCharacters": 20,
            "embeddedMinAlphabeticRatio": 0.4,
            "embeddedMaxTokenRepetitionRatio": 0.5,
        }
    )
    return MadozManifest.model_validate(values)


def _manifest(*, max_chunk_chars: int = 1500) -> MadozManifest:
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
                "candidatePdfPageRanges": [{"start": 1, "end": 1}],
                "pageInventoryPath": "inventory/pages.jsonl",
                "expectedPageInventorySha256": "1" * 64,
                "inventoryReviewStatus": "verified",
                "inventoryVerifiedAt": "2026-09-02T00:00:00+02:00",
                "canonicalization": {
                    "defaultStatus": "include",
                    "defaultOrder": "source_order",
                    "duplicateDecisions": [],
                    "pageOverrides": [],
                },
                "splitSpreads": False,
                "gutterRatio": 0.5,
                "innerGutterTrimRatio": 0.005,
                "leafOverrides": [],
            },
            "coverage": {
                "status": "partial_source",
                "statement": "The source omits a known printed page.",
                "observedPrintedRanges": [{"start": "1", "end": "1"}],
                "missingPrintedPages": ["2"],
                "acceptedForProduct": False,
                "acceptedAt": None,
            },
            "processing": {
                "textMode": "ocr",
                "renderDpi": 300,
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
                "maxChunkChars": max_chunk_chars,
                "overlapLines": 2,
                "layoutPolicy": "madoz-two-column-v1",
                "entryPolicy": "madoz-entry-v1",
            },
        }
    )


def _inventory(
    *,
    pdf_page: int = 1,
    side: str = "full",
    status: str = "include",
    logical_page: int | None = 1,
    printed_label: str | None = "42",
) -> PageInventoryRecord:
    values = {
        "schemaVersion": 1,
        "pdfPage": pdf_page,
        "side": side,
        "mediaBox": (0.0, 0.0, 24.0, 48.0),
        "pdfRotationDegrees": 0,
        "printedLabelCandidates": [],
        "normalizedPrintedLabel": printed_label,
        "printedLabelBox": None,
        "printedLabelSource": "manifest_override" if printed_label else "missing",
        "visualDhash64": "0" * 16,
        "duplicateCandidates": [],
        "anomalyFlags": [],
        "canonicalStatus": status,
        "duplicateOf": None,
        "canonicalSequenceIndex": logical_page,
        "continuityBreakBefore": True,
    }
    if status == "exclude_nonbody":
        values["decisionReason"] = "not content"
    return PageInventoryRecord.model_validate(values)


def _rendered(
    *,
    width: int = 100,
    height: int = 100,
    rgb: bytes | None = None,
    pdf_page: int = 1,
    side: str = "full",
    rotation: int = 0,
    content_class: str = "normal",
    table_regions: tuple[ManifestTableRegion, ...] = (),
) -> RenderedLeaf:
    return RenderedLeaf(
        candidate=CandidateLeaf(
            pdf_page=pdf_page,
            side=side,
            crop_box=(0.0, 0.0, 1.0, 1.0),
            rotation_degrees=rotation,
            content_class=content_class,
            table_regions=table_regions,
        ),
        width_px=width,
        height_px=height,
        render_dpi=300,
        rasterization_policy="pymupdf-page-render-v1",
        rgb_bytes=rgb if rgb is not None else bytes([255]) * width * height * 3,
        image_sha256="a" * 64,
        visual_dhash64="0" * 16,
        embedded_words=(),
        dominant_raster=None,
        media_box=(0.0, 0.0, 24.0, 48.0),
        pdf_rotation_degrees=0,
    )


def _line(
    text: str,
    box: tuple[float, float, float, float],
    *,
    confidence: float = 0.9,
    correction: int = 0,
    width: int = 100,
    height: int = 100,
) -> ExtractedLineCandidate:
    x0, y0, x1, y1 = box
    return ExtractedLineCandidate(
        originalText=text,
        confidence=confidence,
        polygon=[
            [x0 * width, y0 * height],
            [x1 * width, y0 * height],
            [x1 * width, y1 * height],
            [x0 * width, y1 * height],
        ],
        correction180=correction,
    )


def _polygon_line(
    text: str,
    polygon: list[list[float]],
    *,
    correction: int = 0,
    confidence: float = 0.9,
) -> ExtractedLineCandidate:
    return ExtractedLineCandidate(
        originalText=text,
        confidence=confidence,
        polygon=polygon,
        correction180=correction,
    )


def test_orders_columns_bands_headers_and_footers_deterministically() -> None:
    lines = [
        _line("right second", (0.60, 0.58, 0.85, 0.62)),
        _line("footer", (0.20, 0.96, 0.80, 0.98)),
        _line("left first", (0.10, 0.20, 0.35, 0.24)),
        _line("divider", (0.10, 0.40, 0.90, 0.44)),
        _line("header", (0.20, 0.01, 0.80, 0.03)),
        _line("right first", (0.60, 0.18, 0.85, 0.22)),
        _line("left second", (0.10, 0.60, 0.35, 0.64)),
    ]
    lines.append(lines[2].model_copy(deep=True))

    page = build_source_page(_manifest(), _inventory(), _rendered(), lines)

    assert [line.originalText for line in page.lines] == [
        "header",
        "left first",
        "right first",
        "divider",
        "left second",
        "right second",
        "footer",
    ]
    assert [line.role for line in page.lines] == [
        "header",
        "body",
        "body",
        "body",
        "body",
        "body",
        "footer",
    ]
    assert all(line.role != "unknown" for line in page.lines)
    assert [line.lineOrder for line in page.lines] == list(range(7))
    assert page.originalText == "\n".join(line.originalText for line in page.lines)
    assert page.printedPageLabel == "42"
    assert page.continuityBreakBefore is True

    expected_page_id = compute_page_id(
        "madoz-test",
        1,
        "full",
        NormalizedBox(x0=0, y0=0, x1=1, y1=1),
        0,
        "sha256:" + "a" * 64,
    )
    assert page.pageId == expected_page_id
    assert [line.lineId for line in page.lines] == [
        compute_line_id(expected_page_id, line.lineOrder, line.originalText, line.box)
        for line in page.lines
    ]


def test_order_is_stable_for_provider_permutations_and_geometry_ties() -> None:
    tied = [
        _line("beta", (0.1, 0.2, 0.3, 0.25), confidence=0.8),
        _line("alpha", (0.1, 0.2, 0.3, 0.25), confidence=0.9),
        _line("alpha", (0.1, 0.2, 0.3, 0.25), confidence=0.8),
    ]
    outputs = {
        tuple(
            line.lineId
            for line in build_source_page(
                _manifest(),
                _inventory(),
                _rendered(),
                list(order),
            ).lines
        )
        for order in permutations(tied)
    }
    assert len(outputs) == 1


def test_derives_orientation_from_longest_edge_with_tolerance_and_correction() -> None:
    lines = [
        _polygon_line("horizontal 180", [[10, 20], [60, 20], [60, 24], [10, 24]], correction=180),
        _polygon_line("vertical 270", [[70, 20], [72, 70], [76, 70], [74, 20]], correction=180),
        _polygon_line("diagonal null", [[10, 50], [50, 73], [48, 77], [8, 54]]),
        _polygon_line("first edge tie", [[55, 55], [55, 65], [65, 65], [65, 55]]),
    ]

    page = build_source_page(_manifest(), _inventory(), _rendered(), lines)
    by_text = {line.originalText: line for line in page.lines}

    assert by_text["horizontal 180"].orientationDegrees == 180
    assert by_text["horizontal 180"].role == "body"
    assert by_text["vertical 270"].orientationDegrees == 270
    assert by_text["vertical 270"].role == "table"
    assert by_text["diagonal null"].orientationDegrees is None
    assert by_text["diagonal null"].role == "body"
    assert by_text["first edge tie"].orientationDegrees == 90
    assert by_text["first edge tie"].role == "table"


@pytest.mark.parametrize(
    ("rotation", "expected_box", "expected_orientation"),
    [
        (90, (0.2, 0.2, 0.3, 0.6), 270),
        (270, (0.5, 0.2, 0.6, 0.6), 90),
    ],
)
def test_rotated_table_pass_replaces_primary_and_transforms_polygon_back(
    rotation: int,
    expected_box: tuple[float, float, float, float],
    expected_orientation: int,
) -> None:
    region = ManifestTableRegion(
        box=[0.2, 0.2, 0.6, 0.6],
        ocrRotationDegrees=rotation,
    )
    rendered = _rendered(table_regions=(region,))
    primary = [
        _line("replaced primary", (0.25, 0.25, 0.35, 0.30)),
        _line("outside", (0.65, 0.30, 0.85, 0.35)),
    ]
    rotated = _polygon_line(
        "rotated table",
        [[0, 0], [40, 0], [40, 10], [0, 10]],
    )

    page = build_source_page(
        _manifest(),
        _inventory(),
        rendered,
        primary,
        rotated_table_lines={0: [rotated]},
    )

    assert "replaced primary" not in page.originalText
    table_line = next(line for line in page.lines if line.originalText == "rotated table")
    assert table_line.role == "table"
    assert table_line.orientationDegrees == expected_orientation
    assert tuple(table_line.box.model_dump().values()) == pytest.approx(expected_box)


def test_table_roles_come_from_regions_content_class_and_vertical_orientation() -> None:
    region = ManifestTableRegion(box=[0.1, 0.1, 0.4, 0.4])
    region_page = build_source_page(
        _manifest(),
        _inventory(),
        _rendered(table_regions=(region,)),
        [
            _line("inside region", (0.15, 0.20, 0.30, 0.25)),
            _line("outside region", (0.60, 0.20, 0.80, 0.25)),
            _polygon_line("vertical", [[60, 40], [62, 80], [66, 80], [64, 40]]),
        ],
    )
    assert {line.originalText: line.role for line in region_page.lines} == {
        "inside region": "table",
        "outside region": "body",
        "vertical": "table",
    }

    table_page = build_source_page(
        _manifest(),
        _inventory(),
        _rendered(content_class="table"),
        [_line("whole page table", (0.2, 0.2, 0.8, 0.25))],
    )
    assert table_page.lines[0].role == "table"


def test_quality_metrics_cover_blank_and_nonblank_without_text() -> None:
    blank = build_source_page(_manifest(), _inventory(), _rendered(), [])
    assert blank.foregroundRatio == 0.0
    assert blank.meanConfidence == 1.0
    assert blank.lowConfidenceRatio == 0.0
    assert blank.qualityScore == 1.0
    assert blank.qualityFlags == ["blank"]

    nonblank = build_source_page(
        _manifest(),
        _inventory(),
        _rendered(rgb=bytes([0]) * 100 * 100 * 3),
        [],
    )
    assert nonblank.foregroundRatio == 1.0
    assert nonblank.meanConfidence == 0.0
    assert nonblank.lowConfidenceRatio == 1.0
    assert nonblank.qualityScore == 0.0
    assert "blank" not in nonblank.qualityFlags
    assert "low_confidence" in nonblank.qualityFlags


def test_quality_is_character_weighted_and_all_complexity_flags_are_sorted() -> None:
    oversize = "x" * 1501
    horizontal = [
        _line(oversize, (0.05, 0.20, 0.40, 0.22), confidence=0.5),
        _line("h2", (0.05, 0.30, 0.40, 0.32), confidence=1.0),
        _line("h3", (0.05, 0.40, 0.40, 0.42), confidence=1.0),
    ]
    vertical = [
        _polygon_line(f"v{index}", [[60 + index, 20], [60 + index, 70], [64 + index, 70], [64 + index, 20]])
        for index in range(3)
    ]
    page = build_source_page(
        _manifest(),
        _inventory(),
        _rendered(rotation=90, rgb=bytes([0]) * 100 * 100 * 3),
        horizontal + vertical,
    )
    total_chars = sum(len(line.originalText) for line in page.lines)
    expected_mean = sum(len(line.originalText) * line.confidence for line in page.lines) / total_chars
    expected_low = len(oversize) / total_chars
    assert page.meanConfidence == pytest.approx(expected_mean)
    assert page.lowConfidenceRatio == pytest.approx(expected_low)
    assert page.qualityScore == pytest.approx(0.7 * expected_mean + 0.3 * (1 - expected_low))
    assert page.qualityFlags == sorted(
        [
            "low_confidence",
            "mixed_orientation",
            "oversize_body_line",
            "rotation_applied",
        ]
    )


def test_table_heavy_uses_non_header_footer_character_denominator() -> None:
    region = ManifestTableRegion(box=[0.1, 0.1, 0.4, 0.4])
    page = build_source_page(
        _manifest(),
        _inventory(),
        _rendered(table_regions=(region,)),
        [
            _line("TTTT", (0.15, 0.20, 0.30, 0.25)),
            _line("BBBBBBBBBBBB", (0.60, 0.20, 0.85, 0.25)),
            _line("ignored header characters", (0.20, 0.01, 0.80, 0.03)),
        ],
    )
    assert "table_heavy" in page.qualityFlags


def test_maps_all_page_provenance_fields() -> None:
    page = build_source_page(
        _manifest(),
        _inventory(),
        _rendered(),
        [_line("body", (0.1, 0.2, 0.4, 0.25))],
        ocr_engine_version="3.7.0",
    )
    assert page.model_dump(mode="json", exclude={"pageId", "originalText", "lines", "meanConfidence", "lowConfidenceRatio", "qualityScore", "qualityFlags"}) == {
        "documentId": "madoz-test",
        "logicalPageNumber": 1,
        "sourcePdfPageNumber": 1,
        "leafSide": "full",
        "continuityBreakBefore": True,
        "cropBox": {"x0": 0.0, "y0": 0.0, "x1": 1.0, "y1": 1.0},
        "printedPageLabel": "42",
        "widthPx": 100,
        "heightPx": 100,
        "renderDpi": 300,
        "rasterizationPolicy": "pymupdf-page-render-v1",
        "rotationDegrees": 0,
        "imageSha256": "sha256:" + "a" * 64,
        "contentClass": "normal",
        "foregroundRatio": 0.0,
        "textSource": "ppocrv6",
        "ocrEngine": "transformers",
        "ocrEngineVersion": "3.7.0",
        "ocrDetectionModel": "PP-OCRv6_medium_det",
        "ocrRecognitionModel": "PP-OCRv6_medium_rec",
    }


def test_rejects_inventory_and_render_mismatches() -> None:
    with pytest.raises(LayoutError):
        build_source_page(
            _manifest(),
            _inventory(pdf_page=2),
            _rendered(pdf_page=1),
            [],
        )
    with pytest.raises(LayoutError):
        build_source_page(
            _manifest(),
            _inventory(status="exclude_nonbody", logical_page=None),
            _rendered(),
            [],
        )


def test_discards_empty_original_text_candidates_before_layout() -> None:
    invalid = ExtractedLineCandidate.model_construct(
        originalText="",
        confidence=0.9,
        polygon=[[10, 20], [40, 20], [40, 24], [10, 24]],
        correction180=0,
    )
    whitespace = _line("   \t  ", (0.1, 0.3, 0.4, 0.34))
    valid = _line("body", (0.1, 0.2, 0.4, 0.25))

    page = build_source_page(_manifest(), _inventory(), _rendered(), [invalid, whitespace, valid])

    assert [line.originalText for line in page.lines] == ["body"]
    assert page.originalText == "body"
    assert page.meanConfidence == 0.9
    assert page.lowConfidenceRatio == 0.0
    assert page.qualityScore == pytest.approx(0.93)
    assert page.qualityFlags == []


def test_rejects_more_than_1000_ocr_lines() -> None:
    candidates = [
        _line(f"line {index}", (0.10, 0.10 + index * 0.0001, 0.30, 0.12 + index * 0.0001))
        for index in range(1000)
    ]
    page = build_source_page(_manifest(), _inventory(), _rendered(), candidates)
    assert len(page.lines) == 1000

    candidates.append(_line("line 1000", (0.10, 0.10 + 1000 * 0.0001, 0.30, 0.12 + 1000 * 0.0001)))
    with pytest.raises(LayoutError, match="page contains more than 1000 OCR lines"):
        build_source_page(_manifest(), _inventory(), _rendered(), candidates)


def test_embedded_source_page_is_deterministic_for_out_of_order_normalized_lines() -> None:
    embedded_lines = [
        EmbeddedTextLine(
            text="second embedded line with enough characters",
            box=(0.10, 0.30, 0.40, 0.34),
            block_index=0,
            line_index=1,
        ),
        EmbeddedTextLine(
            text="first embedded line with enough characters",
            box=(0.10, 0.20, 0.40, 0.24),
            block_index=0,
            line_index=0,
        ),
    ]

    page = build_embedded_source_page(
        _embedded_manifest(),
        _inventory(),
        _rendered(),
        embedded_lines,
        confidence=0.82,
        pymupdf_version="1.28.2",
    )

    assert page.textSource == "embedded"
    assert page.ocrEngine == "pymupdf"
    assert page.ocrEngineVersion == "1.28.2"
    assert page.ocrDetectionModel == "pdf-text-layer"
    assert page.ocrRecognitionModel == "pdf-text-layer"
    assert [line.originalText for line in page.lines] == [
        "first embedded line with enough characters",
        "second embedded line with enough characters",
    ]
    assert [line.box.model_dump() for line in page.lines] == [
        {"x0": 0.10, "y0": 0.20, "x1": 0.40, "y1": 0.24},
        {"x0": 0.10, "y0": 0.30, "x1": 0.40, "y1": 0.34},
    ]
    assert [line.confidence for line in page.lines] == [0.82, 0.82]


def test_rejects_invalid_rgb_and_rotated_region_coverage() -> None:
    region = ManifestTableRegion(
        box=[0.2, 0.2, 0.6, 0.6],
        ocrRotationDegrees=90,
    )
    with pytest.raises(LayoutError):
        build_source_page(
            _manifest(),
            _inventory(),
            _rendered(rgb=b"short"),
            [],
        )
    with pytest.raises(LayoutError):
        build_source_page(
            _manifest(),
            _inventory(),
            _rendered(table_regions=(region,)),
            [],
        )
    with pytest.raises(LayoutError):
        build_source_page(
            _manifest(),
            _inventory(),
            _rendered(),
            [],
            rotated_table_lines={0: []},
        )
