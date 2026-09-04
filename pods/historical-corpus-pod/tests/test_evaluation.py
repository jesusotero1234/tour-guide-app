from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import httpx2
import pytest
from pydantic import ValidationError

from historical_corpus.evaluation import (
    GoldEntryBoundary,
    GoldReferenceLine,
    OcrEvaluationError,
    OcrGateConfig,
    OcrGoldPage,
    RetrievalCase,
    RetrievalEvaluationError,
    RetrievalGateConfig,
    RetrievalTarget,
    _align_lines,
    evaluate_ocr,
    evaluate_retrieval,
    levenshtein_distance,
    load_ocr_gold_jsonl,
    load_retrieval_cases_jsonl,
    validate_retrieval_api_base_url,
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


def test_critical_tokens_ignore_typographic_punctuation_equivalents() -> None:
    first_text = "21 vec. , 64 almas ."
    second_text = "36°42′48″"
    page = _page(
        originalText=f"{first_text}\n{second_text}",
        lines=[
            _line(lineId="sha256:" + "d" * 64, lineOrder=0, originalText=first_text),
            _line(lineId="sha256:" + "e" * 64, lineOrder=1, originalText=second_text),
        ],
    )
    gold = _gold(
        referenceLines=[
            {"text": first_text, "role": "body"},
            {"text": second_text, "role": "body"},
        ],
        entryBoundaries=[],
        criticalTokens=["21 vec., 64 almas.", "36º42'48\""],
    )

    report = _evaluate(sample=_sample(page), gold=[gold])

    assert report.metrics.criticalTokenAnnotations == 2
    assert report.metrics.missingCriticalTokens == 0
    assert report.metrics.criticalTokenError == 0.0


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

    above_minimum = _evaluate(
        sample=sample,
        gold=[gold_second, gold_first],
        config=OcrGateConfig(expectedPageCount=1),
    )
    assert above_minimum.gates["sampleSize"]


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


def test_tracked_synthetic_gold_example_runs_perfect_two_page_evaluation() -> None:
    gold_path = Path(__file__).parents[1] / "examples" / "ocr-gold.example.jsonl"
    gold = load_ocr_gold_jsonl(gold_path.read_bytes())
    assert len(gold) == 2
    assert [page.logicalPageNumber for page in gold] == [1, 3]
    assert [page.sourcePdfPageNumber for page in gold] == [1, 3]
    assert all(page.documentId.startswith("synthetic-") for page in gold)
    assert any(
        line.text.endswith(":")
        for page in gold
        for line in page.referenceLines
        if line.role == "body"
    )

    base = _sample()
    base_page = base.pages[0]
    base_ref = base.selectedPages[0]

    pages = []
    refs = []
    for index, gold_page in enumerate(gold):
        lines = [
            SourceLineInput.model_validate(
                _line(
                    lineId="sha256:" + f"{index * 10 + line_index + 1:064x}",
                    logicalPageNumber=gold_page.logicalPageNumber,
                    lineOrder=line_index,
                    originalText=ref_line.text,
                    role=ref_line.role,
                )
            )
            for line_index, ref_line in enumerate(gold_page.referenceLines)
        ]
        page = base_page.model_copy(
            update={
                "documentId": gold_page.documentId,
                "logicalPageNumber": gold_page.logicalPageNumber,
                "sourcePdfPageNumber": gold_page.sourcePdfPageNumber,
                "pageId": "sha256:" + f"{index + 1:064x}",
                "imageSha256": "sha256:" + f"{index + 100:064x}",
                "contentClass": gold_page.pageClass,
                "originalText": "\n".join(ref_line.text for ref_line in gold_page.referenceLines),
                "lines": lines,
                "printedPageLabel": str(gold_page.logicalPageNumber),
                "continuityBreakBefore": index == 1,
            }
        )
        ref = base_ref.model_copy(
            update={
                "logicalPageNumber": gold_page.logicalPageNumber,
                "pdfPage": gold_page.sourcePdfPageNumber,
            }
        )
        pages.append(page)
        refs.append(ref)

    sample = base.model_copy(
        update={
            "metadata": base.metadata.model_copy(update={"documentId": gold[0].documentId}),
            "selectedPages": refs,
            "pages": pages,
            "chunks": [],
        }
    )

    table_line = next(line for line in pages[0].lines if line.role == "table")
    assert not any(chunk.lineIds and table_line.lineId in chunk.lineIds for chunk in sample.chunks)
    assert pages[1].continuityBreakBefore is True

    report = evaluate_ocr(
        sample,
        gold,
        config=OcrGateConfig(expectedPageCount=2),
        evaluated_at=EVALUATED_AT,
    )
    assert report.passed
    assert report.metrics.failedPages == 0
    assert report.metrics.boundaryF1 == 1.0
    assert report.metrics.readingOrderAccuracy == 1.0


def test_corrected_text_is_measured_and_labeled_separately() -> None:
    corrected_page = _page(
        originalText="MALXGA: ciudad historica.",
        lines=[
            _line(
                lineId="sha256:" + "a" * 64,
                lineOrder=0,
                originalText="MALXGA: ciudad historica.",
                correctedText="MÁLAGA: ciudad histórica.",
            )
        ],
    )
    gold = _gold()
    report = _evaluate(sample=_sample(corrected_page), gold=[gold])
    assert report.metrics.cer == 0.0
    assert report.metrics.wer == 0.0
    assert report.metrics.criticalTokenError == 0.0
    assert report.pages[0].textSource == "ppocrv6+corrections"
    assert report.byTextSource["ppocrv6+corrections"] == report.metrics

    uncorrected_page = _page(
        originalText="MÁLAGA: ciudad histórica.",
        lines=[
            _line(
                lineId="sha256:" + "b" * 64,
                lineOrder=0,
                originalText="MÁLAGA: ciudad histórica.",
            )
        ],
    )
    uncorrected_report = _evaluate(sample=_sample(uncorrected_page), gold=[gold])
    assert uncorrected_report.pages[0].textSource == "ppocrv6"
    assert uncorrected_report.byTextSource["ppocrv6"] == uncorrected_report.metrics


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


def _retrieval_target(**updates: object) -> RetrievalTarget:
    payload: dict[str, object] = {
        "documentId": "doc-1",
        "entryTitle": "MÁLAGA",
        "logicalPages": [1],
        "printedPages": ["34"],
    }
    payload.update(updates)
    return RetrievalTarget.model_validate(payload)


def _retrieval_case(**updates: object) -> RetrievalCase:
    payload: dict[str, object] = {
        "id": "case-1",
        "query": "historia de Málaga",
        "relevantTargets": [_retrieval_target().model_dump()],
        "requiredTerms": ["Málaga"],
    }
    payload.update(updates)
    return RetrievalCase.model_validate(payload)


def _retrieval_case_payload(**updates: object) -> dict[str, object]:
    payload = _retrieval_case().model_dump(mode="json")
    payload.update(updates)
    return payload


def _retrieval_jsonl(*rows: dict[str, object]) -> bytes:
    return ("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n").encode()


def _hit(
    chunk_id: str = "chunk-1",
    *,
    document_id: str = "doc-1",
    page_start: int = 1,
    page_end: int = 1,
    entry_title: str = "MÁLAGA",
    text: str = "Málaga, ciudad histórica",
) -> dict[str, object]:
    return {
        "chunkId": chunk_id,
        "documentId": document_id,
        "pageStart": page_start,
        "pageEnd": page_end,
        "entryTitle": entry_title,
        "text": text,
    }


class _FakeRetrievalApi:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, object | None, dict[str, float] | None]] = []
        self.documents: dict[str, dict[str, object]] = {
            "doc-1": {"documentId": "doc-1", "missingPrintedPages": []},
            "doc-2": {"documentId": "doc-2", "missingPrintedPages": []},
        }
        self.summaries: dict[str, list[dict[str, object]]] = {
            "doc-1": [
                {"documentId": "doc-1", "logicalPageNumber": 1, "printedPageLabel": "34"}
            ],
            "doc-2": [
                {"documentId": "doc-2", "logicalPageNumber": 2, "printedPageLabel": "35"}
            ],
        }
        self.search_hits: list[dict[str, object]] = [_hit()]
        self.chunks: dict[str, dict[str, object]] = {
            "chunk-1": {
                "chunkId": "chunk-1",
                "documentId": "doc-1",
                "pageStart": 1,
                "pageEnd": 1,
                "lineIds": ["line-1"],
            }
        }
        self.details: dict[tuple[str, int], dict[str, object]] = {
            ("doc-1", 1): {
                "documentId": "doc-1",
                "logicalPageNumber": 1,
                "lines": [{"lineId": "line-1", "role": "body"}],
            },
            ("doc-2", 2): {
                "documentId": "doc-2",
                "logicalPageNumber": 2,
                "lines": [{"lineId": "line-2", "role": "body"}],
            },
        }
        self.search_status = 200
        self.search_payload: object = None
        self.timeout_on_search = False
        self.timeout_paths: set[str] = set()
        self.not_found_paths: set[str] = set()

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content) if request.content else None
        timeout = request.extensions.get("timeout")
        self.calls.append((request.method, request.url.path, body, timeout))
        path = request.url.path
        if path in self.timeout_paths:
            raise httpx2.TimeoutException("timed out", request=request)
        if path in self.not_found_paths:
            return httpx2.Response(404, json={"error": "missing"})
        if request.method == "POST" and path == "/v1/search":
            if self.timeout_on_search:
                raise httpx2.TimeoutException("timed out", request=request)
            if self.search_status != 200:
                headers = {"location": "/redirected"} if 300 <= self.search_status < 400 else None
                return httpx2.Response(self.search_status, headers=headers, json={"error": "failed"})
            payload = self.search_payload
            return httpx2.Response(
                200,
                json=payload if payload is not None else {"hits": self.search_hits},
            )
        if request.method == "GET" and path.startswith("/v1/documents/"):
            parts = path.split("/")
            document_id = parts[3]
            if len(parts) == 4:
                document = self.documents.get(document_id)
                return (
                    httpx2.Response(200, json=document)
                    if document is not None
                    else httpx2.Response(404, json={"error": "missing"})
                )
            if len(parts) == 5 and parts[4] == "pages":
                summaries = self.summaries.get(document_id)
                return (
                    httpx2.Response(200, json=summaries)
                    if summaries is not None
                    else httpx2.Response(404, json={"error": "missing"})
                )
            if len(parts) == 6 and parts[4] == "pages":
                detail = self.details.get((document_id, int(parts[5])))
                return (
                    httpx2.Response(200, json=detail)
                    if detail is not None
                    else httpx2.Response(404, json={"error": "missing"})
                )
        if request.method == "GET" and path.startswith("/v1/chunks/"):
            chunk = self.chunks.get(path.rsplit("/", 1)[-1])
            return (
                httpx2.Response(200, json=chunk)
                if chunk is not None
                else httpx2.Response(404, json={"error": "missing"})
            )
        return httpx2.Response(404, json={"error": "unexpected"})


def _evaluate_retrieval(
    fake: _FakeRetrievalApi,
    cases: list[RetrievalCase] | None = None,
    *,
    config: RetrievalGateConfig | None = None,
    api_base_url: str = "http://127.0.0.1:3010",
):
    return evaluate_retrieval(
        api_base_url,
        cases or [_retrieval_case()],
        transport=httpx2.MockTransport(fake),
        config=config or RetrievalGateConfig(minimumCaseCount=1),
        evaluated_at=EVALUATED_AT,
    )


def test_tracked_synthetic_retrieval_examples_run_evaluation() -> None:
    example_path = Path(__file__).parents[1] / "examples" / "retrieval-cases.example.jsonl"
    cases = load_retrieval_cases_jsonl(example_path.read_bytes())
    assert len(cases) == 2
    assert all(case.id.startswith("synthetic-") for case in cases)
    assert all(target.documentId.startswith("synthetic-") for case in cases for target in case.relevantTargets)
    assert [target.logicalPages[0] for case in cases for target in case.relevantTargets] == [1, 3]

    fake = _FakeRetrievalApi()
    fake.documents = {}
    fake.summaries = {}
    fake.search_hits = []
    fake.chunks = {}
    fake.details = {}

    for case in cases:
        for target in case.relevantTargets:
            doc_id = target.documentId
            page_num = target.logicalPages[0]
            fake.documents.setdefault(
                doc_id, {"documentId": doc_id, "missingPrintedPages": []}
            )
            fake.summaries.setdefault(doc_id, []).append(
                {
                    "documentId": doc_id,
                    "logicalPageNumber": page_num,
                    "printedPageLabel": target.printedPages[0],
                }
            )
            chunk_id = f"chunk-{case.id}"
            line_id = f"line-{case.id}"
            fake.search_hits.append(
                _hit(
                    chunk_id,
                    document_id=doc_id,
                    page_start=page_num,
                    page_end=page_num,
                    entry_title=target.entryTitle,
                    text=" ".join(case.requiredTerms),
                )
            )
            fake.chunks[chunk_id] = {
                "chunkId": chunk_id,
                "documentId": doc_id,
                "pageStart": page_num,
                "pageEnd": page_num,
                "lineIds": [line_id],
            }
            fake.details[(doc_id, page_num)] = {
                "documentId": doc_id,
                "logicalPageNumber": page_num,
                "lines": [
                    {"lineId": line_id, "role": "body"},
                    {"lineId": f"table-{case.id}", "role": "table"},
                ],
            }

    table_line_ids = {
        line["lineId"]
        for detail in fake.details.values()
        for line in detail["lines"]
        if line["role"] == "table"
    }
    assert table_line_ids
    assert all(
        table_line_ids.isdisjoint(chunk["lineIds"]) for chunk in fake.chunks.values()
    )

    report = _evaluate_retrieval(fake, cases, config=RetrievalGateConfig(minimumCaseCount=2))
    assert report.passed
    assert report.metrics.recallAt20 == 1.0
    assert report.metrics.requiredTermPresence == 1.0
    assert report.metrics.structuralIntegrity == 1.0
    assert report.metrics.exceptionCases == 0
    assert report.metrics.mrrAt20 >= 0.75

    doc_paths = [path for _, path, _, _ in fake.calls if path.startswith("/v1/documents/")]
    assert sum(path == f"/v1/documents/{cases[0].relevantTargets[0].documentId}" for path in doc_paths) == 1
    assert sum(path == f"/v1/documents/{cases[0].relevantTargets[0].documentId}/pages" for path in doc_paths) == 1


def test_retrieval_loader_and_models_are_strict() -> None:
    loaded = load_retrieval_cases_jsonl(_retrieval_jsonl(_retrieval_case_payload()))
    assert loaded == (_retrieval_case(),)

    invalid_targets = [
        {"documentId": "doc-1", "entryTitle": "MÁLAGA", "logicalPages": [], "printedPages": []},
        {
            "documentId": "doc-1",
            "entryTitle": "MÁLAGA",
            "logicalPages": [2, 1],
            "printedPages": ["35", "34"],
        },
        {
            "documentId": "doc-1",
            "entryTitle": "MÁLAGA",
            "logicalPages": [1, 1],
            "printedPages": ["34", "34"],
        },
        {
            "documentId": "doc-1",
            "entryTitle": "MÁLAGA",
            "logicalPages": [1],
            "printedPages": [],
        },
    ]
    for target in invalid_targets:
        with pytest.raises((ValidationError, RetrievalEvaluationError)):
            RetrievalTarget.model_validate(target)
    with pytest.raises(ValidationError):
        RetrievalCase.model_validate(_retrieval_case_payload(extra=True))
    with pytest.raises(ValidationError):
        RetrievalCase.model_validate(_retrieval_case_payload(query="bad\u0000query"))
    with pytest.raises(ValidationError):
        RetrievalCase.model_validate(_retrieval_case_payload(query=""))


def test_retrieval_loader_enforces_envelope_and_unique_ids() -> None:
    with pytest.raises(RetrievalEvaluationError, match="LF"):
        load_retrieval_cases_jsonl(_retrieval_jsonl(_retrieval_case_payload()).rstrip(b"\n"))
    with pytest.raises(RetrievalEvaluationError, match="UTF-8"):
        load_retrieval_cases_jsonl(b"\xff\n")
    with pytest.raises(RetrievalEvaluationError, match="2 MiB"):
        load_retrieval_cases_jsonl(b"x" * (2 * 1024 * 1024 + 1))
    with pytest.raises(RetrievalEvaluationError, match="500"):
        load_retrieval_cases_jsonl(
            _retrieval_jsonl(
                *[_retrieval_case_payload(id=f"case-{index}") for index in range(501)]
            )
        )
    with pytest.raises(RetrievalEvaluationError, match="unique"):
        load_retrieval_cases_jsonl(
            _retrieval_jsonl(_retrieval_case_payload(), _retrieval_case_payload())
        )


@pytest.mark.parametrize(
    ("url", "normalized"),
    [
        ("http://127.0.0.1:3010", "http://127.0.0.1:3010"),
        ("http://localhost:3010/", "http://localhost:3010"),
        ("http://historical-corpus-api:3010", "http://historical-corpus-api:3010"),
    ],
)
def test_retrieval_api_url_allowlist(url: str, normalized: str) -> None:
    assert validate_retrieval_api_base_url(url) == normalized


@pytest.mark.parametrize(
    "url",
    [
        "https://127.0.0.1:3010",
        "http://127.0.0.1",
        "http://127.0.0.1:3011",
        "http://127.0.0.1.evil:3010",
        "http://user:pass@localhost:3010",
        "http://localhost:3010/api",
        "http://localhost:3010?query=1",
        "http://localhost:3010/#fragment",
        "http://localhost:not-a-port",
        " http://localhost:3010",
        "http://localhost:3010\n",
    ],
)
def test_retrieval_api_url_rejects_unsafe_values(url: str) -> None:
    with pytest.raises(RetrievalEvaluationError):
        validate_retrieval_api_base_url(url)


def test_retrieval_request_order_payload_timeout_cache_and_report() -> None:
    fake = _FakeRetrievalApi()
    cases = [_retrieval_case(id="case-b"), _retrieval_case(id="case-a")]
    report = _evaluate_retrieval(fake, cases)

    assert [case.id for case in report.cases] == ["case-a", "case-b"]
    assert [(method, path) for method, path, _, _ in fake.calls[:3]] == [
        ("GET", "/v1/documents/doc-1"),
        ("GET", "/v1/documents/doc-1/pages"),
        ("POST", "/v1/search"),
    ]
    assert sum(path == "/v1/documents/doc-1" for _, path, _, _ in fake.calls) == 1
    assert sum(path == "/v1/documents/doc-1/pages" for _, path, _, _ in fake.calls) == 1
    posts = [call for call in fake.calls if call[0] == "POST"]
    assert [call[2] for call in posts] == [
        {"query": "historia de Málaga", "limit": 20},
        {"query": "historia de Málaga", "limit": 20},
    ]
    for _, _, _, timeout in posts:
        assert timeout == {"connect": 3.0, "read": 30.0, "write": 30.0, "pool": 30.0}
    assert report.evaluatedAt == EVALUATED_AT
    assert report.metrics.recallAt20 == 1.0
    assert report.metrics.precisionAt8 == 0.125
    assert report.metrics.mrrAt20 == 1.0
    assert report.metrics.requiredTermPresence == 1.0
    assert report.metrics.structuralIntegrity == 1.0
    assert report.metrics.exceptionCases == 0
    assert report.passed


@pytest.mark.parametrize(
    "mutation",
    ["missing_page", "null_label", "wrong_label", "declared_gap"],
)
def test_retrieval_rejects_invalid_printed_coverage_before_search(mutation: str) -> None:
    fake = _FakeRetrievalApi()
    if mutation == "missing_page":
        fake.summaries["doc-1"] = []
    elif mutation == "null_label":
        fake.summaries["doc-1"][0]["printedPageLabel"] = None
    elif mutation == "wrong_label":
        fake.summaries["doc-1"][0]["printedPageLabel"] = "999"
    else:
        fake.documents["doc-1"]["missingPrintedPages"] = ["34"]

    with pytest.raises(RetrievalEvaluationError):
        _evaluate_retrieval(fake)
    assert not any(method == "POST" for method, _, _, _ in fake.calls)


def test_retrieval_metrics_multiple_targets_duplicates_terms_and_integrity() -> None:
    fake = _FakeRetrievalApi()
    fake.search_hits = [
        _hit("chunk-1", text="La CIUDAD de Málaga"),
        _hit("chunk-1", text="Málaga ciudad repetida"),
        _hit("chunk-3", entry_title="RONDA", text="texto irrelevante"),
    ]
    fake.chunks["chunk-3"] = {
        "chunkId": "chunk-3",
        "documentId": "doc-1",
        "pageStart": 1,
        "pageEnd": 1,
        "lineIds": ["line-1"],
    }
    case = _retrieval_case(
        relevantTargets=[
            _retrieval_target().model_dump(),
            _retrieval_target(
                documentId="doc-2",
                entryTitle="GRANADA",
                logicalPages=[2],
                printedPages=["35"],
            ).model_dump(),
        ],
        requiredTerms=["ciudad", "ausente"],
    )
    report = _evaluate_retrieval(
        fake,
        [case],
        config=RetrievalGateConfig(
            minimumCaseCount=1,
            minRecallAt20=0.0,
            minMrrAt20=0.0,
        ),
    )
    assert report.metrics.recallAt20 == 0.5
    assert report.metrics.precisionAt8 == 0.25
    assert report.metrics.mrrAt20 == 1.0
    assert report.metrics.requiredTermPresence == 0.5
    assert report.metrics.structuralIntegrity == 1.0
    assert sum(path == "/v1/chunks/chunk-1" for _, path, _, _ in fake.calls) == 1
    assert sum(path == "/v1/documents/doc-1/pages/1" for _, path, _, _ in fake.calls) == 1


def test_retrieval_zero_hits_and_top_twenty_truncation() -> None:
    empty = _FakeRetrievalApi()
    empty.search_hits = []
    empty_report = _evaluate_retrieval(empty, [_retrieval_case(requiredTerms=[])])
    assert empty_report.metrics.recallAt20 == 0.0
    assert empty_report.metrics.precisionAt8 == 0.0
    assert empty_report.metrics.mrrAt20 == 0.0
    assert empty_report.metrics.requiredTermPresence == 1.0
    assert empty_report.metrics.structuralIntegrity == 1.0

    truncated = _FakeRetrievalApi()
    truncated.search_hits = [
        _hit("chunk-1", entry_title="RONDA") for _ in range(20)
    ] + [_hit("chunk-1")]
    report = _evaluate_retrieval(
        truncated,
        config=RetrievalGateConfig(
            minimumCaseCount=1,
            minRecallAt20=0.0,
            minMrrAt20=0.0,
        ),
    )
    assert report.metrics.recallAt20 == 0.0
    assert report.metrics.mrrAt20 == 0.0


def test_retrieval_precision_uses_first_eight_positions_and_terms_do_not_span_hits() -> None:
    fake = _FakeRetrievalApi()
    fake.search_hits = [
        _hit("chunk-1", entry_title="RONDA", text="irrelevante") for _ in range(8)
    ] + [
        _hit("chunk-1", text="San"),
        _hit("chunk-1", text="Pedro"),
    ]
    report = _evaluate_retrieval(
        fake,
        [_retrieval_case(requiredTerms=["San Pedro"])],
        config=RetrievalGateConfig(
            minimumCaseCount=1,
            minRecallAt20=0.0,
            minMrrAt20=0.0,
        ),
    )
    assert report.metrics.recallAt20 == 1.0
    assert report.metrics.precisionAt8 == 0.0
    assert report.metrics.mrrAt20 == pytest.approx(1 / 9)
    assert report.metrics.requiredTermPresence == 0.0


@pytest.mark.parametrize("failure", ["chunk_404", "chunk_mismatch", "line_missing", "non_body"])
def test_retrieval_structural_integrity_detects_bad_evidence(failure: str) -> None:
    fake = _FakeRetrievalApi()
    if failure == "chunk_404":
        fake.chunks.clear()
    elif failure == "chunk_mismatch":
        fake.chunks["chunk-1"]["pageEnd"] = 2
    elif failure == "line_missing":
        fake.details[("doc-1", 1)]["lines"] = []
    else:
        fake.details[("doc-1", 1)]["lines"] = [{"lineId": "line-1", "role": "table"}]
    report = _evaluate_retrieval(
        fake,
        config=RetrievalGateConfig(
            minimumCaseCount=1,
            minStructuralIntegrity=0.0,
        ),
    )
    assert report.metrics.structuralIntegrity == 0.0
    assert report.metrics.exceptionCases == 0


@pytest.mark.parametrize("failure", ["malformed_chunk", "transport"])
def test_retrieval_integrity_protocol_failure_marks_exception_case(failure: str) -> None:
    fake = _FakeRetrievalApi()
    if failure == "malformed_chunk":
        fake.chunks["chunk-1"].pop("lineIds")
    else:
        fake.timeout_paths.add("/v1/chunks/chunk-1")
    report = _evaluate_retrieval(fake)
    assert report.metrics.exceptionCases == 1
    assert report.metrics.recallAt20 == 0.0
    assert report.metrics.mrrAt20 == 0.0
    assert report.metrics.structuralIntegrity == 0.0
    assert report.cases[0].exception
    assert not report.passed


@pytest.mark.parametrize("failure", ["redirect", "server_error", "schema", "timeout"])
def test_retrieval_search_failures_do_not_redirect_and_fail_case(failure: str) -> None:
    fake = _FakeRetrievalApi()
    if failure == "redirect":
        fake.search_status = 302
    elif failure == "server_error":
        fake.search_status = 500
    elif failure == "schema":
        fake.search_payload = {"hits": "not-a-list"}
    else:
        fake.timeout_on_search = True

    report = _evaluate_retrieval(fake)
    assert report.metrics.exceptionCases == 1
    assert report.metrics.recallAt20 == 0.0
    assert report.metrics.mrrAt20 == 0.0
    assert not report.gates["exceptionCases"]
    assert not report.passed
    if failure == "redirect":
        assert not any(path == "/redirected" for _, path, _, _ in fake.calls)


def test_retrieval_preflight_timeout_fails_case_before_search() -> None:
    fake = _FakeRetrievalApi()
    fake.timeout_paths.add("/v1/documents/doc-1")
    report = _evaluate_retrieval(fake)
    assert report.metrics.exceptionCases == 1
    assert report.metrics.recallAt20 == 0.0
    assert report.metrics.mrrAt20 == 0.0
    assert not any(method == "POST" for method, _, _, _ in fake.calls)
    assert not report.passed


def test_retrieval_gate_defaults_are_inclusive() -> None:
    defaults = RetrievalGateConfig()
    assert defaults.minimumCaseCount == 20
    assert defaults.minRecallAt20 == 0.90
    assert defaults.minMrrAt20 == 0.75
    assert defaults.minStructuralIntegrity == 1.0
    assert defaults.maxExceptionCases == 0

    fake = _FakeRetrievalApi()
    report = _evaluate_retrieval(
        fake,
        config=RetrievalGateConfig(
            minimumCaseCount=1,
            minRecallAt20=1.0,
            minMrrAt20=1.0,
            minStructuralIntegrity=1.0,
            maxExceptionCases=0,
        ),
    )
    assert report.passed
    assert all(report.gates.values())


def test_retrieval_report_does_not_store_query_or_hit_text() -> None:
    fake = _FakeRetrievalApi()
    fake.search_hits = [_hit(text="SECRET HIT TEXT")]
    report = _evaluate_retrieval(fake, [_retrieval_case(query="SECRET QUERY")])
    serialized = report.model_dump_json()
    assert "SECRET QUERY" not in serialized
    assert "SECRET HIT TEXT" not in serialized
