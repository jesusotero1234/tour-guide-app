from __future__ import annotations

import hashlib
import math
import pytest

from historical_corpus.identity import compute_chunk_id
from historical_corpus.ingest_models import SourceLineInput, SourcePageInput
from historical_corpus.madoz_chunking import (
    ChunkingError,
    build_prepared_chunks,
    detect_entry_title,
)
from historical_corpus.models import DocumentMetadata, NormalizedBox, RightsMetadata


def _sha(value: str) -> str:
    return "sha256:" + hashlib.sha256(value.encode()).hexdigest()


def _metadata(*, historical_period: str | None = "1848") -> DocumentMetadata:
    return DocumentMetadata(
        documentId="madoz-test",
        sourceUrl="https://example.org/record",
        title="Diccionario geográfico",
        author="Pascual Madoz",
        edition="Tomo XI",
        publicationYear=1848,
        language="es",
        countryCode="ES",
        sourceClass="primary_historical",
        contentHash="sha256:" + "0" * 64,
        rights=RightsMetadata(
            status="pending_intended_use_review",
            uri="https://example.org/rights",
            verifiedAt="2026-09-02T00:00:00+02:00",
            isExplicitlyReusable=False,
        ),
        historicalPeriod=historical_period,
    )


def _line(
    page: int,
    order: int,
    text: str,
    *,
    role: str = "body",
    confidence: float = 0.9,
    line_id: str | None = None,
) -> SourceLineInput:
    return SourceLineInput(
        lineId=line_id or _sha(f"line:{page}:{order}:{text}"),
        logicalPageNumber=page,
        lineOrder=order,
        originalText=text,
        confidence=confidence,
        box=NormalizedBox(x0=0.1, y0=0.1 + order * 0.001, x1=0.9, y1=0.11 + order * 0.001),
        orientationDegrees=0,
        role=role,
    )


def _page(
    number: int,
    lines: list[SourceLineInput],
    *,
    break_before: bool = False,
    document_id: str = "madoz-test",
) -> SourcePageInput:
    return SourcePageInput(
        pageId=_sha(f"page:{number}"),
        documentId=document_id,
        logicalPageNumber=number,
        sourcePdfPageNumber=number,
        leafSide="full",
        continuityBreakBefore=break_before,
        cropBox=NormalizedBox(x0=0, y0=0, x1=1, y1=1),
        printedPageLabel=str(number),
        widthPx=100,
        heightPx=100,
        renderDpi=300,
        rasterizationPolicy="pymupdf-page-render-v1",
        rotationDegrees=0,
        imageSha256=_sha(f"image:{number}"),
        contentClass="normal",
        foregroundRatio=0.1,
        textSource="ppocrv6",
        ocrEngine="transformers",
        ocrEngineVersion="3.7.0",
        ocrDetectionModel="PP-OCRv6_medium_det",
        ocrRecognitionModel="PP-OCRv6_medium_rec",
        meanConfidence=0.9,
        lowConfidenceRatio=0.0,
        qualityScore=0.93,
        qualityFlags=[],
        originalText="\n".join(line.originalText for line in lines),
        lines=lines,
    )


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("MALAGA. Texto", "MALAGA"),
        ("MALAGA: Texto", "MALAGA"),
        ("MALAGA-Texto", "MALAGA"),
        ("MALAGA—Texto", "MALAGA"),
        ("MALAGA (PROVINCIA DE): descripción", "MALAGA (PROVINCIA DE)"),
        ("\u2003MALAGA\u2002: descripción", "MALAGA"),
        ("ÁVILA  DEL  REY: descripción", "ÁVILA  DEL  REY"),
        ("ABcd: ratio exactly 0.5", None),
        ("AbC D: ratio exactly 0.75", "AbC D"),
        ("1MALAGA: starts with digit", None),
        ("A: one letter", None),
        ("Malaga: title case is not uppercase enough", None),
        ("MALAGA without delimiter", None),
        ("MALAGA. SECOND: uses first", "MALAGA"),
    ],
)
def test_detect_entry_title_contract(text: str, expected: str | None) -> None:
    assert detect_entry_title(text) == expected


def test_chunks_entries_and_ignores_prefix_and_non_body_roles() -> None:
    lines = [
        _line(1, 0, "unassigned preface"),
        _line(1, 1, "running header", role="header"),
        _line(1, 2, "MALAGA: primera entrada", confidence=0.8),
        _line(1, 3, "continuación", confidence=1.0),
        _line(1, 4, "tabla", role="table"),
        _line(1, 5, "MARBELLA—segunda entrada", confidence=0.6),
        _line(1, 6, "otra línea", confidence=0.9),
        _line(1, 7, "pie", role="footer"),
    ]

    chunks = build_prepared_chunks(_metadata(), [_page(1, lines)], 1500, 2)

    assert len(chunks) == 2
    assert chunks[0].entryTitle == "MALAGA"
    assert chunks[0].lineIds == [lines[2].lineId, lines[3].lineId]
    assert chunks[0].originalText == "MALAGA: primera entrada\ncontinuación"
    assert chunks[1].entryTitle == "MARBELLA"
    assert chunks[1].lineIds == [lines[5].lineId, lines[6].lineId]
    assert all("unassigned" not in chunk.originalText for chunk in chunks)
    assert all("header" not in chunk.originalText for chunk in chunks)
    assert all("tabla" not in chunk.originalText for chunk in chunks)


def test_entry_continues_only_across_consecutive_pages_without_break() -> None:
    page_one = _page(1, [_line(1, 0, "MALAGA: inicio")])
    page_two = _page(2, [_line(2, 0, "continúa")])
    chunks = build_prepared_chunks(_metadata(), [page_two, page_one], 1500, 0)
    assert len(chunks) == 1
    assert chunks[0].pageStart == 1
    assert chunks[0].pageEnd == 2
    assert chunks[0].originalText == "MALAGA: inicio\ncontinúa"

    broken = _page(
        2,
        [_line(2, 0, "prefijo omitido"), _line(2, 1, "MARBELLA: reinicio")],
        break_before=True,
    )
    chunks = build_prepared_chunks(_metadata(), [page_one, broken], 1500, 0)
    assert [chunk.entryTitle for chunk in chunks] == ["MALAGA", "MARBELLA"]
    assert all("prefijo omitido" not in chunk.originalText for chunk in chunks)


def test_gap_closes_entry_and_resets_detection_to_unassigned_prefix() -> None:
    pages = [
        _page(1, [_line(1, 0, "MALAGA: inicio")]),
        _page(3, [_line(3, 0, "continuación falsa")]),
    ]
    chunks = build_prepared_chunks(_metadata(), pages, 1500, 0)
    assert len(chunks) == 1
    assert chunks[0].originalText == "MALAGA: inicio"


def test_chunk_fields_ids_and_weighted_confidence_are_exact() -> None:
    lines = [
        _line(1, 0, "MALAGA: abc", confidence=0.5),
        _line(1, 1, "1234567890", confidence=1.0),
    ]
    chunk = build_prepared_chunks(_metadata(), [_page(1, lines)], 1500, 0)[0]
    expected_text = "MALAGA: abc\n1234567890"
    expected_section = ["Diccionario Madoz", "Tomo XI", "MALAGA"]
    expected_confidence = math.fsum(
        len(line.originalText) * line.confidence for line in lines
    ) / sum(len(line.originalText) for line in lines)

    assert chunk.originalText == expected_text
    assert chunk.correctedText is None
    assert chunk.pageStart == chunk.pageEnd == 1
    assert chunk.sectionPath == expected_section
    assert chunk.cityQids == []
    assert chunk.entityQids == []
    assert chunk.historicalPeriod == "1848"
    assert chunk.ocrConfidence == pytest.approx(expected_confidence, abs=1e-12)
    assert chunk.entryTitle == "MALAGA"
    assert chunk.lineIds == [line.lineId for line in lines]
    assert chunk.chunkId == compute_chunk_id(
        "madoz-test",
        1,
        1,
        expected_section,
        expected_text,
    )


def test_splits_only_between_lines_and_applies_progressive_overlap() -> None:
    texts = ["MALAGA:" + "x" * 92, "a" * 100, "b" * 100, "c" * 100]
    lines = [_line(1, index, text) for index, text in enumerate(texts)]
    chunks = build_prepared_chunks(_metadata(), [_page(1, lines)], 256, 1)
    assert [chunk.lineIds for chunk in chunks] == [
        [lines[0].lineId, lines[1].lineId],
        [lines[1].lineId, lines[2].lineId],
        [lines[2].lineId, lines[3].lineId],
    ]
    assert all(len(chunk.originalText) <= 210 for chunk in chunks)


def test_removes_oldest_overlap_until_the_next_new_line_fits() -> None:
    title = "MALAGA:" + "x" * 193
    lines = [_line(1, 0, title), _line(1, 1, "n" * 100)]
    chunks = build_prepared_chunks(_metadata(), [_page(1, lines)], 256, 1)
    assert [chunk.lineIds for chunk in chunks] == [
        [lines[0].lineId],
        [lines[1].lineId],
    ]


def test_512_id_limit_splits_513_lines_with_progress() -> None:
    first = [_line(1, 0, "MALAGA:")]
    first.extend(_line(1, index, "x") for index in range(1, 500))
    second = [_line(2, index, "x") for index in range(13)]
    chunks = build_prepared_chunks(
        _metadata(),
        [_page(1, first), _page(2, second)],
        65536,
        0,
    )
    assert [len(chunk.lineIds) for chunk in chunks] == [512, 1]
    assert chunks[0].lineIds[-1] == second[11].lineId
    assert chunks[1].lineIds == [second[12].lineId]


def test_oversize_body_line_fails_closed_with_page_and_line_id() -> None:
    line = _line(1, 0, "MALAGA:" + "x" * 250)
    with pytest.raises(ChunkingError, match=f"OVERSIZE_BODY_LINE.*1.*{line.lineId}"):
        build_prepared_chunks(_metadata(), [_page(1, [line])], 256, 0)


def test_replay_and_page_input_order_produce_identical_canonical_chunks() -> None:
    page_one = _page(1, [_line(1, 0, "MALAGA: uno")])
    page_two = _page(2, [_line(2, 0, "sigue"), _line(2, 1, "MARBELLA: dos")])
    forward = build_prepared_chunks(_metadata(), [page_one, page_two], 1500, 1)
    replay = build_prepared_chunks(_metadata(), [page_two, page_one], 1500, 1)
    assert [chunk.model_dump(mode="json") for chunk in forward] == [
        chunk.model_dump(mode="json") for chunk in replay
    ]


@pytest.mark.parametrize(
    ("max_chars", "overlap"),
    [(255, 0), (65537, 0), (1500, -1), (1500, 33)],
)
def test_rejects_invalid_chunking_limits(max_chars: int, overlap: int) -> None:
    with pytest.raises(ChunkingError):
        build_prepared_chunks(_metadata(), [], max_chars, overlap)


def test_rejects_missing_period_duplicate_pages_and_document_mismatch() -> None:
    with pytest.raises(ChunkingError):
        build_prepared_chunks(_metadata(historical_period=None), [], 1500, 0)

    page = _page(1, [_line(1, 0, "MALAGA: uno")])
    with pytest.raises(ChunkingError):
        build_prepared_chunks(_metadata(), [page, page], 1500, 0)

    wrong_document = _page(
        1,
        [_line(1, 0, "MALAGA: uno")],
        document_id="other-document",
    )
    with pytest.raises(ChunkingError):
        build_prepared_chunks(_metadata(), [wrong_document], 1500, 0)


def test_rejects_duplicate_line_ids_across_pages() -> None:
    duplicate_id = _sha("duplicate")
    pages = [
        _page(1, [_line(1, 0, "MALAGA: uno", line_id=duplicate_id)]),
        _page(2, [_line(2, 0, "continúa", line_id=duplicate_id)]),
    ]
    with pytest.raises(ChunkingError):
        build_prepared_chunks(_metadata(), pages, 1500, 0)
