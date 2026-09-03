from __future__ import annotations

import json
import math
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from historical_corpus.evaluation import (
    GoldEntryBoundary,
    GoldReferenceLine,
    OcrEvaluationError,
    OcrGateConfig,
    OcrGoldPage,
    _align_lines,
    evaluate_ocr,
    levenshtein_distance,
    load_ocr_gold_jsonl,
)
from historical_corpus.ingest_models import OcrEvaluationSample, PreparedDocument, SourceLineInput
from test_ingest_models import (
    _evaluation_sample,
    _line,
    _page,
    _prepared_document,
)


EVALUATED_AT = datetime(2026, 9, 3, 12, 0, tzinfo=timezone.utc)


def _sample(page_payload: dict[str, object] | None = None) -> OcrEvaluationSample:
    sample = OcrEvaluationSample.model_validate(_evaluation_sample())
    if page_payload is None:
        return sample
    updates = dict(page_payload)
    updates["lines"] = [
        SourceLineInput.model_validate(line) for line in updates.get("lines", [])
    ]
    page = sample.pages[0].model_copy(update=updates)
    return sample.model_copy(update={"pages": [page]})


def _gold_payload(**updates: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "documentId": "madoz-11",
        "logicalPageNumber": 1,
        "sourcePdfPageNumber": 39,
        "pageClass": "normal",
        "referenceLines": [
            {
                "text": "MÁLAGA: ciudad histórica.",
                "role": "body",
                "orderAnchor": "MÁLAGA",
            }
        ],
        "entryBoundaries": [
            {"entryTitle": "MÁLAGA", "lineIndex": 0, "charOffset": 0}
        ],
        "criticalTokens": ["MÁLAGA"],
    }
    payload.update(updates)
    return payload


def _gold(**updates: object) -> OcrGoldPage:
    return OcrGoldPage.model_validate(_gold_payload(**updates))


def _jsonl(*rows: dict[str, object]) -> bytes:
    return ("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n").encode()


def _evaluate(
    sample: OcrEvaluationSample | None = None,
    gold: list[OcrGoldPage] | None = None,
    config: OcrGateConfig | None = None,
):
    return evaluate_ocr(
        sample or _sample(),
        gold or [_gold()],
        config=config or OcrGateConfig(expectedPageCount=1),
        evaluated_at=EVALUATED_AT,
    )


def _line_input(order: int, text: str, *, confidence: float = 0.95) -> SourceLineInput:
    return SourceLineInput.model_validate(
        _line(
            lineId=f"sha256:{order + 10:064x}",
            lineOrder=order,
            originalText=text,
            confidence=confidence,
            role="body",
        )
    )


def test_gold_loader_accepts_strict_jsonl_and_normalizes_for_uniqueness() -> None:
    loaded = load_ocr_gold_jsonl(_jsonl(_gold_payload()))
    assert len(loaded) == 1
    assert loaded[0].referenceText == "MÁLAGA: ciudad histórica."

    duplicate = _gold_payload(
        criticalTokens=["San  Pedro", "San Pedro"],
    )
    with pytest.raises((ValidationError, OcrEvaluationError)):
        load_ocr_gold_jsonl(_jsonl(duplicate))


@pytest.mark.parametrize(
    "payload",
    [
        _gold_payload(extra="forbidden"),
        _gold_payload(referenceLines=[{"text": "bad\u0000text", "role": "body"}]),
        _gold_payload(referenceLines=[{"text": "   ", "role": "body"}]),
        _gold_payload(
            referenceLines=[
                {"text": "A", "role": "body", "orderAnchor": "San  Pedro"},
                {"text": "B", "role": "body", "orderAnchor": "San Pedro"},
            ],
            entryBoundaries=[],
        ),
        _gold_payload(
            referenceLines=[{"text": "HEAD", "role": "header"}],
            entryBoundaries=[{"entryTitle": "HEAD", "lineIndex": 0, "charOffset": 0}],
        ),
        _gold_payload(
            entryBoundaries=[{"entryTitle": "MÁLAGA", "lineIndex": 0, "charOffset": 1}]
        ),
        _gold_payload(pageClass="blank"),
        _gold_payload(pageClass="normal", referenceLines=[], entryBoundaries=[]),
    ],
)
def test_gold_validators_reject_invalid_rows(payload: dict[str, object]) -> None:
    with pytest.raises((ValidationError, OcrEvaluationError)):
        load_ocr_gold_jsonl(_jsonl(payload))


def test_gold_loader_enforces_file_envelope_and_unique_keys() -> None:
    with pytest.raises(OcrEvaluationError, match="LF"):
        load_ocr_gold_jsonl(_jsonl(_gold_payload()).rstrip(b"\n"))
    with pytest.raises(OcrEvaluationError, match="UTF-8"):
        load_ocr_gold_jsonl(b"\xff\n")
    with pytest.raises(OcrEvaluationError, match="8 MiB"):
        load_ocr_gold_jsonl(b"x" * (8 * 1024 * 1024 + 1))
    with pytest.raises(OcrEvaluationError, match="64"):
        load_ocr_gold_jsonl(
            _jsonl(
                *[
                    _gold_payload(logicalPageNumber=index, sourcePdfPageNumber=index)
                    for index in range(1, 66)
                ]
            )
        )
    with pytest.raises(OcrEvaluationError, match="unique"):
        load_ocr_gold_jsonl(_jsonl(_gold_payload(), _gold_payload()))


def test_gold_blank_page_is_valid_only_with_empty_annotations() -> None:
    blank = _gold(
        pageClass="blank",
        referenceLines=[],
        entryBoundaries=[],
        criticalTokens=[],
    )
    assert blank.referenceText == ""
    with pytest.raises(ValidationError):
        OcrGoldPage.model_validate(
            _gold_payload(
                pageClass="blank",
                referenceLines=[],
                entryBoundaries=[],
                criticalTokens=["unexpected"],
            )
        )


def test_local_levenshtein_and_alignment_tie_break_are_deterministic() -> None:
    assert levenshtein_distance("kitten", "sitting") == 3
    assert levenshtein_distance("Málaga", "Ma\u0301laga") == 0
    assert _align_lines(["A"], ["A", "A"]) == ((0, 1),)
    assert _align_lines(["completely different"], ["z"]) == ()


def test_evaluation_requires_exact_sample_type_and_selected_gold_coverage() -> None:
    prepared = PreparedDocument.model_validate(_prepared_document())
    with pytest.raises(OcrEvaluationError, match="OcrEvaluationSample"):
        evaluate_ocr(prepared, [_gold()])  # type: ignore[arg-type]

    with pytest.raises(OcrEvaluationError, match="selectedPages"):
        _evaluate(gold=[_gold(logicalPageNumber=2)])
    with pytest.raises(OcrEvaluationError, match="sourcePdfPageNumber"):
        _evaluate(gold=[_gold(sourcePdfPageNumber=40)])


def test_perfect_page_uses_shared_title_detector_and_reports_strata() -> None:
    report = _evaluate()
    metrics = report.metrics
    assert metrics.pageCount == 1
    assert metrics.failedPages == 0
    assert metrics.cer == 0.0
    assert metrics.wer == 0.0
    assert metrics.caseInsensitiveCer == 0.0
    assert metrics.criticalTokenError == 0.0
    assert metrics.boundaryPrecision == 1.0
    assert metrics.boundaryRecall == 1.0
    assert metrics.boundaryF1 == 1.0
    assert metrics.readingOrderAccuracy == 1.0
    assert metrics.lowConfidenceRatio == 0.0
    assert report.byPageClass["normal"] == metrics
    assert report.byTextSource["ppocrv6"] == metrics
    assert report.passed
    assert all(report.gates.values())
    assert report.evaluatedAt == EVALUATED_AT
    assert report.evaluatedAt.utcoffset() is not None


def test_critical_boundary_and_order_errors_are_micro_counted() -> None:
    page = _page(
        originalText="Málaga: ciudad histórica.\nGRANADA: segunda.\nRONDA: tercera.",
        lines=[
            _line(lineId="sha256:" + "a" * 64, lineOrder=0, originalText="Málaga: ciudad histórica."),
            _line(lineId="sha256:" + "b" * 64, lineOrder=1, originalText="GRANADA: segunda."),
            _line(lineId="sha256:" + "c" * 64, lineOrder=2, originalText="RONDA: tercera."),
        ],
    )
    gold = _gold(
        referenceLines=[
            {"text": "MÁLAGA: ciudad histórica.", "role": "body", "orderAnchor": "GRANADA"},
            {"text": "GRANADA: segunda.", "role": "body", "orderAnchor": "Málaga"},
            {"text": "RONDA: tercera.", "role": "body", "orderAnchor": "RONDA"},
        ],
        entryBoundaries=[
            {"entryTitle": "MÁLAGA", "lineIndex": 0, "charOffset": 0},
            {"entryTitle": "GRANADA", "lineIndex": 1, "charOffset": 0},
        ],
        criticalTokens=["MÁLAGA", "ausente"],
    )
    report = _evaluate(
        sample=_sample(page),
        gold=[gold],
        config=OcrGateConfig(
            expectedPageCount=1,
            maxCer=1.0,
            maxWer=1.0,
            maxCriticalTokenError=1.0,
            minBoundaryF1=0.0,
            minReadingOrderAccuracy=0.0,
        ),
    )
    assert report.metrics.criticalTokenAnnotations == 2
    assert report.metrics.missingCriticalTokens == 2
    assert report.metrics.criticalTokenError == 1.0
    assert report.metrics.boundaryTp == 1
    assert report.metrics.boundaryFp == 1
    assert report.metrics.boundaryFn == 1
    assert report.metrics.readingOrderCorrectPairs == 1
    assert report.metrics.readingOrderTotalPairs == 2
    assert report.metrics.readingOrderAccuracy == 0.5


def test_low_confidence_ratio_weights_characters_and_pages_are_sorted() -> None:
    base = _sample()
    base_page = base.pages[0]
    first_line = _line_input(0, "AA")
    second_line = _line_input(0, "BBBBBB")
    first = base_page.model_copy(
        update={"originalText": "AA", "lines": [first_line], "lowConfidenceRatio": 0.25}
    )
    second = base_page.model_copy(
        update={
            "logicalPageNumber": 2,
            "sourcePdfPageNumber": 40,
            "pageId": "sha256:" + "f" * 64,
            "originalText": "BBBBBB",
            "lines": [second_line.model_copy(update={"logicalPageNumber": 2})],
            "lowConfidenceRatio": 0.75,
        }
    )
    second_ref = base.selectedPages[0].model_copy(
        update={"logicalPageNumber": 2, "pdfPage": 40}
    )
    sample = base.model_copy(
        update={"selectedPages": [base.selectedPages[0], second_ref], "pages": [second, first]}
    )
    gold_first = _gold(
        referenceLines=[{"text": "AA", "role": "body"}],
        entryBoundaries=[],
        criticalTokens=[],
    )
    gold_second = _gold(
        logicalPageNumber=2,
        sourcePdfPageNumber=40,
        referenceLines=[{"text": "BBBBBB", "role": "body"}],
        entryBoundaries=[],
        criticalTokens=[],
    )
    report = _evaluate(
        sample=sample,
        gold=[gold_second, gold_first],
        config=OcrGateConfig(expectedPageCount=2),
    )
    assert math.isclose(report.metrics.lowConfidenceRatio, 0.625)
    assert [page.logicalPageNumber for page in report.pages] == [1, 2]


def test_blank_and_missing_embedded_pages_are_failed_deterministically() -> None:
    blank_gold = _gold(
        pageClass="blank",
        referenceLines=[],
        entryBoundaries=[],
        criticalTokens=[],
    )
    blank_page = _page(originalText="", lines=[], qualityFlags=["blank"])
    assert _evaluate(sample=_sample(blank_page), gold=[blank_gold]).metrics.failedPages == 0
    assert _evaluate(gold=[blank_gold]).metrics.failedPages == 1

    missing = _sample().model_copy(update={"pages": []})
    missing_report = _evaluate(sample=missing)
    assert missing_report.metrics.failedPages == 1
    assert not missing_report.passed


def test_gate_thresholds_are_inclusive_and_each_failure_blocks() -> None:
    imperfect_page = _page(
        originalText="Málaga: ciudad cambiada.",
        lines=[_line(originalText="Málaga: ciudad cambiada.")],
    )
    imperfect_gold = _gold(criticalTokens=["ausente"])
    permissive = OcrGateConfig(
        expectedPageCount=1,
        maxCer=1.0,
        maxWer=1.0,
        maxCriticalTokenError=1.0,
        minBoundaryF1=0.0,
        minReadingOrderAccuracy=0.0,
    )
    baseline = _evaluate(sample=_sample(imperfect_page), gold=[imperfect_gold], config=permissive)
    assert baseline.passed

    metrics = baseline.metrics
    inclusive = permissive.model_copy(
        update={
            "maxCer": metrics.cer,
            "maxWer": metrics.wer,
            "maxCriticalTokenError": metrics.criticalTokenError,
            "minBoundaryF1": metrics.boundaryF1,
            "minReadingOrderAccuracy": metrics.readingOrderAccuracy,
        }
    )
    assert _evaluate(sample=_sample(imperfect_page), gold=[imperfect_gold], config=inclusive).passed

    adverse_configs = [
        inclusive.model_copy(update={"expectedPageCount": 2}),
        inclusive.model_copy(update={"maxFailedPages": -1}),
        inclusive.model_copy(update={"maxCer": max(0.0, metrics.cer - 1e-12)}),
        inclusive.model_copy(update={"maxWer": max(0.0, metrics.wer - 1e-12)}),
        inclusive.model_copy(
            update={"maxCriticalTokenError": max(0.0, metrics.criticalTokenError - 1e-12)}
        ),
        inclusive.model_copy(update={"minBoundaryF1": min(1.0, metrics.boundaryF1 + 1e-12)}),
        inclusive.model_copy(
            update={"minReadingOrderAccuracy": metrics.readingOrderAccuracy + 1e-12}
        ),
    ]
    gate_names = [
        "sampleSize",
        "failedPages",
        "cer",
        "wer",
        "criticalTokenError",
        "boundaryF1",
        "readingOrderAccuracy",
    ]
    for config, gate_name in zip(adverse_configs, gate_names, strict=True):
        report = _evaluate(sample=_sample(imperfect_page), gold=[imperfect_gold], config=config)
        assert not report.gates[gate_name]
        assert not report.passed


def test_report_never_serializes_full_ocr_or_gold_text() -> None:
    report = _evaluate()
    serialized = report.model_dump_json()
    assert "ciudad histórica" not in serialized
    assert "referenceText" not in serialized
    assert "originalText" not in serialized

    def inspect(value: object) -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                if "text" in key.casefold() or "diff" in key.casefold():
                    assert not isinstance(item, str) or len(item) <= 256
                inspect(item)
        elif isinstance(value, list):
            for item in value:
                inspect(item)

    inspect(report.model_dump(mode="json"))


def test_gold_component_models_are_strict() -> None:
    line = GoldReferenceLine(text="  SAN   PEDRO  ", role="body", orderAnchor=None)
    boundary = GoldEntryBoundary(entryTitle="SAN PEDRO", lineIndex=0, charOffset=0)
    assert line.text == "  SAN   PEDRO  "
    assert boundary.charOffset == 0
    with pytest.raises(ValidationError):
        GoldReferenceLine.model_validate({"text": "x", "role": "body", "extra": True})
