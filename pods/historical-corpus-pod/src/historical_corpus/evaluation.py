from __future__ import annotations

import json
import math
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, Sequence

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from historical_corpus.ingest_models import OcrEvaluationSample
from historical_corpus.madoz_chunking import detect_entry_title


_MAX_GOLD_BYTES = 8 * 1024 * 1024
_MAX_GOLD_ROWS = 64
_ALIGNMENT_DISTANCE_LIMIT = 0.35
_BOUNDARY_TITLE_DISTANCE_LIMIT = 0.20


class OcrEvaluationError(ValueError):
    pass


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _contains_control(value: str) -> bool:
    return any(unicodedata.category(character).startswith("C") for character in value)


def _validate_text(value: str, *, label: str, allow_blank: bool = False) -> str:
    if _contains_control(value):
        raise ValueError(f"{label} must not contain control characters")
    if not allow_blank and not _normalize_line(value):
        raise ValueError(f"{label} must not be blank")
    return value


def _normalize_line(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value).split())


def _normalized_page_text(lines: Sequence[str]) -> str:
    return "\n".join(_normalize_line(line) for line in lines)


def _normalized_distance(left: str, right: str) -> float:
    normalized_left = _normalize_line(left)
    normalized_right = _normalize_line(right)
    return levenshtein_distance(normalized_left, normalized_right) / max(
        len(normalized_left), len(normalized_right), 1
    )


class GoldReferenceLine(_StrictModel):
    text: str = Field(min_length=1, max_length=4096)
    role: Literal["body", "header", "footer", "table", "unknown"]
    orderAnchor: str | None = Field(default=None, min_length=1, max_length=128)

    @field_validator("text")
    @classmethod
    def _validate_line_text(cls, value: str) -> str:
        return _validate_text(value, label="reference line")

    @field_validator("orderAnchor")
    @classmethod
    def _validate_anchor(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _validate_text(value, label="order anchor")


class GoldEntryBoundary(_StrictModel):
    entryTitle: str = Field(min_length=1, max_length=100)
    lineIndex: int = Field(ge=0, le=499)
    charOffset: Literal[0]

    @field_validator("entryTitle")
    @classmethod
    def _validate_title(cls, value: str) -> str:
        return _validate_text(value, label="entry title")


class OcrGoldPage(_StrictModel):
    documentId: str = Field(min_length=1, max_length=128)
    logicalPageNumber: int = Field(ge=1, le=2000)
    sourcePdfPageNumber: int = Field(ge=1, le=1000)
    pageClass: Literal["normal", "table", "mixed_orientation", "blank"]
    referenceLines: list[GoldReferenceLine] = Field(max_length=500)
    entryBoundaries: list[GoldEntryBoundary] = Field(max_length=500)
    criticalTokens: list[str] = Field(max_length=128)

    @field_validator("documentId")
    @classmethod
    def _validate_document_id(cls, value: str) -> str:
        return _validate_text(value, label="documentId")

    @field_validator("criticalTokens")
    @classmethod
    def _validate_critical_tokens(cls, value: list[str]) -> list[str]:
        normalized: set[str] = set()
        for token in value:
            if not isinstance(token, str) or not 1 <= len(token) <= 128:
                raise ValueError("critical tokens must contain 1-128 characters")
            _validate_text(token, label="critical token")
            key = _normalize_line(token)
            if key in normalized:
                raise ValueError("critical tokens must be unique after normalization")
            normalized.add(key)
        return value

    @model_validator(mode="after")
    def _validate_page(self) -> "OcrGoldPage":
        if self.pageClass == "blank":
            if self.referenceLines or self.entryBoundaries or self.criticalTokens:
                raise ValueError("blank gold pages must have empty annotations")
            return self

        if not self.referenceLines or not self.referenceText.split():
            raise ValueError("non-blank gold pages require reference text")

        anchors: set[str] = set()
        for line in self.referenceLines:
            if line.orderAnchor is None:
                continue
            anchor = _normalize_line(line.orderAnchor)
            if anchor in anchors:
                raise ValueError("order anchors must be unique after normalization")
            anchors.add(anchor)

        boundary_lines: set[int] = set()
        for boundary in self.entryBoundaries:
            if boundary.lineIndex >= len(self.referenceLines):
                raise ValueError("entry boundary lineIndex is out of range")
            if self.referenceLines[boundary.lineIndex].role != "body":
                raise ValueError("entry boundaries must reference body lines")
            if boundary.lineIndex in boundary_lines:
                raise ValueError("entry boundaries must use unique lineIndex values")
            boundary_lines.add(boundary.lineIndex)
        return self

    @property
    def referenceText(self) -> str:
        return _normalized_page_text([line.text for line in self.referenceLines])


class OcrGateConfig(_StrictModel):
    expectedPageCount: int = Field(default=24, ge=1, le=64)
    maxFailedPages: int = Field(default=0, ge=0, le=64)
    maxCer: float = Field(default=0.08, ge=0.0, le=1.0)
    maxWer: float = Field(default=0.18, ge=0.0, le=1.0)
    maxCriticalTokenError: float = Field(default=0.05, ge=0.0, le=1.0)
    minBoundaryF1: float = Field(default=0.90, ge=0.0, le=1.0)
    minReadingOrderAccuracy: float = Field(default=0.95, ge=0.0, le=1.0)

    @field_validator(
        "maxCer",
        "maxWer",
        "maxCriticalTokenError",
        "minBoundaryF1",
        "minReadingOrderAccuracy",
    )
    @classmethod
    def _validate_finite_threshold(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("gate thresholds must be finite")
        return value


class OcrMetricSet(_StrictModel):
    pageCount: int = Field(ge=0)
    failedPages: int = Field(ge=0)
    characterErrors: int = Field(ge=0)
    goldCharacters: int = Field(ge=0)
    cer: float = Field(ge=0.0)
    caseInsensitiveCharacterErrors: int = Field(ge=0)
    caseInsensitiveCer: float = Field(ge=0.0)
    wordErrors: int = Field(ge=0)
    goldWords: int = Field(ge=0)
    wer: float = Field(ge=0.0)
    criticalTokenAnnotations: int = Field(ge=0)
    missingCriticalTokens: int = Field(ge=0)
    criticalTokenError: float = Field(ge=0.0, le=1.0)
    boundaryTp: int = Field(ge=0)
    boundaryFp: int = Field(ge=0)
    boundaryFn: int = Field(ge=0)
    boundaryPrecision: float = Field(ge=0.0, le=1.0)
    boundaryRecall: float = Field(ge=0.0, le=1.0)
    boundaryF1: float = Field(ge=0.0, le=1.0)
    readingOrderCorrectPairs: int = Field(ge=0)
    readingOrderTotalPairs: int = Field(ge=0)
    readingOrderAccuracy: float = Field(ge=0.0, le=1.0)
    lowConfidenceCharacters: float = Field(ge=0.0)
    extractedCharacters: int = Field(ge=0)
    lowConfidenceRatio: float = Field(ge=0.0, le=1.0)


class OcrPageEvaluation(_StrictModel):
    documentId: str
    logicalPageNumber: int
    sourcePdfPageNumber: int
    pageClass: Literal["normal", "table", "mixed_orientation", "blank"]
    textSource: str
    failed: bool
    metrics: OcrMetricSet


class OcrEvaluationReport(_StrictModel):
    schemaVersion: Literal[1]
    evaluatedAt: datetime
    config: OcrGateConfig
    metrics: OcrMetricSet
    byPageClass: dict[str, OcrMetricSet]
    byTextSource: dict[str, OcrMetricSet]
    pages: list[OcrPageEvaluation]
    gates: dict[str, bool]
    passed: bool

    @field_validator("evaluatedAt")
    @classmethod
    def _validate_evaluated_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("evaluatedAt must include a timezone")
        return value


def _reject_json_constant(value: str) -> None:
    raise ValueError(f"invalid JSON constant: {value}")


def load_ocr_gold_jsonl(payload: bytes) -> tuple[OcrGoldPage, ...]:
    if not isinstance(payload, bytes):
        raise OcrEvaluationError("gold input must be bytes")
    if len(payload) > _MAX_GOLD_BYTES:
        raise OcrEvaluationError("gold input exceeds 8 MiB")
    if not payload.endswith(b"\n"):
        raise OcrEvaluationError("gold input must end with LF")
    try:
        decoded = payload.decode("utf-8")
    except UnicodeDecodeError:
        raise OcrEvaluationError("gold input must be valid UTF-8") from None

    rows = decoded.splitlines()
    if not 1 <= len(rows) <= _MAX_GOLD_ROWS:
        raise OcrEvaluationError("gold input must contain 1..64 rows")
    if any(not row.strip() for row in rows):
        raise OcrEvaluationError("gold input must not contain blank rows")

    pages: list[OcrGoldPage] = []
    keys: set[tuple[str, int]] = set()
    for row in rows:
        try:
            value = json.loads(row, parse_constant=_reject_json_constant)
            if not isinstance(value, dict):
                raise ValueError("row must be an object")
            page = OcrGoldPage.model_validate(value)
        except (json.JSONDecodeError, ValidationError, ValueError, TypeError):
            raise OcrEvaluationError("gold input contains an invalid row") from None
        key = (page.documentId, page.logicalPageNumber)
        if key in keys:
            raise OcrEvaluationError("gold document/page keys must be unique")
        keys.add(key)
        pages.append(page)
    return tuple(pages)


def levenshtein_distance(left: str, right: str) -> int:
    normalized_left = _normalize_line(left)
    normalized_right = _normalize_line(right)
    if normalized_left == normalized_right:
        return 0
    if len(normalized_left) < len(normalized_right):
        normalized_left, normalized_right = normalized_right, normalized_left
    previous = list(range(len(normalized_right) + 1))
    for left_index, left_character in enumerate(normalized_left, start=1):
        current = [left_index]
        for right_index, right_character in enumerate(normalized_right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1] + (left_character != right_character),
                )
            )
        previous = current
    return previous[-1]


def _align_lines(
    extracted_lines: Sequence[str],
    reference_lines: Sequence[str],
) -> tuple[tuple[int, int], ...]:
    extracted = [_normalize_line(line) for line in extracted_lines]
    reference = [_normalize_line(line) for line in reference_lines]
    row_count = len(extracted) + 1
    column_count = len(reference) + 1
    costs = [[0.0] * column_count for _ in range(row_count)]
    choices = [[""] * column_count for _ in range(row_count)]
    for row in range(1, row_count):
        costs[row][0] = float(row)
        choices[row][0] = "delete"
    for column in range(1, column_count):
        costs[0][column] = float(column)
        choices[0][column] = "insert"

    for row in range(1, row_count):
        for column in range(1, column_count):
            distance = _normalized_distance(extracted[row - 1], reference[column - 1])
            candidates = (
                (costs[row - 1][column - 1] + distance, "diagonal"),
                (costs[row - 1][column] + 1.0, "delete"),
                (costs[row][column - 1] + 1.0, "insert"),
            )
            best_cost, best_choice = min(candidates, key=lambda candidate: candidate[0])
            costs[row][column] = best_cost
            choices[row][column] = best_choice

    accepted: list[tuple[int, int]] = []
    row = len(extracted)
    column = len(reference)
    while row or column:
        choice = choices[row][column]
        if choice == "diagonal":
            extracted_index = row - 1
            reference_index = column - 1
            if (
                _normalized_distance(
                    extracted[extracted_index], reference[reference_index]
                )
                <= _ALIGNMENT_DISTANCE_LIMIT
            ):
                accepted.append((extracted_index, reference_index))
            row -= 1
            column -= 1
        elif choice == "delete":
            row -= 1
        else:
            column -= 1
    accepted.reverse()
    return tuple(accepted)


@dataclass
class _Counts:
    page_count: int = 0
    failed_pages: int = 0
    character_errors: int = 0
    gold_characters: int = 0
    case_insensitive_character_errors: int = 0
    word_errors: int = 0
    gold_words: int = 0
    critical_annotations: int = 0
    missing_critical_tokens: int = 0
    boundary_tp: int = 0
    boundary_fp: int = 0
    boundary_fn: int = 0
    order_correct_pairs: int = 0
    order_total_pairs: int = 0
    low_confidence_characters: float = 0.0
    extracted_characters: int = 0

    def add(self, other: "_Counts") -> None:
        for name in self.__dataclass_fields__:
            setattr(self, name, getattr(self, name) + getattr(other, name))

    def metrics(self) -> OcrMetricSet:
        boundary_precision = _one_for_zero_zero(
            self.boundary_tp, self.boundary_tp + self.boundary_fp
        )
        boundary_recall = _one_for_zero_zero(
            self.boundary_tp, self.boundary_tp + self.boundary_fn
        )
        boundary_f1 = (
            2.0 * boundary_precision * boundary_recall / (boundary_precision + boundary_recall)
            if boundary_precision + boundary_recall
            else 0.0
        )
        return OcrMetricSet(
            pageCount=self.page_count,
            failedPages=self.failed_pages,
            characterErrors=self.character_errors,
            goldCharacters=self.gold_characters,
            cer=_zero_for_zero_zero(self.character_errors, self.gold_characters),
            caseInsensitiveCharacterErrors=self.case_insensitive_character_errors,
            caseInsensitiveCer=_zero_for_zero_zero(
                self.case_insensitive_character_errors, self.gold_characters
            ),
            wordErrors=self.word_errors,
            goldWords=self.gold_words,
            wer=_zero_for_zero_zero(self.word_errors, self.gold_words),
            criticalTokenAnnotations=self.critical_annotations,
            missingCriticalTokens=self.missing_critical_tokens,
            criticalTokenError=_zero_for_zero_zero(
                self.missing_critical_tokens, self.critical_annotations
            ),
            boundaryTp=self.boundary_tp,
            boundaryFp=self.boundary_fp,
            boundaryFn=self.boundary_fn,
            boundaryPrecision=boundary_precision,
            boundaryRecall=boundary_recall,
            boundaryF1=boundary_f1,
            readingOrderCorrectPairs=self.order_correct_pairs,
            readingOrderTotalPairs=self.order_total_pairs,
            readingOrderAccuracy=_one_for_zero_zero(
                self.order_correct_pairs, self.order_total_pairs
            ),
            lowConfidenceCharacters=self.low_confidence_characters,
            extractedCharacters=self.extracted_characters,
            lowConfidenceRatio=_zero_for_zero_zero(
                self.low_confidence_characters, self.extracted_characters
            ),
        )


def _zero_for_zero_zero(numerator: int | float, denominator: int | float) -> float:
    return 0.0 if denominator == 0 else float(numerator) / float(denominator)


def _one_for_zero_zero(numerator: int | float, denominator: int | float) -> float:
    return 1.0 if denominator == 0 else float(numerator) / float(denominator)


def _boundary_counts(
    extracted_lines: Sequence[Any],
    gold: OcrGoldPage,
    alignment: Sequence[tuple[int, int]],
) -> tuple[int, int, int]:
    predicted: list[tuple[int, str]] = []
    for index, line in enumerate(extracted_lines):
        if line.role != "body":
            continue
        title = detect_entry_title(line.originalText)
        if title is not None:
            predicted.append((index, title))

    extracted_to_gold = dict(alignment)
    gold_by_line = {boundary.lineIndex: boundary for boundary in gold.entryBoundaries}
    matched_gold: set[int] = set()
    true_positives = 0
    false_positives = 0
    for extracted_index, predicted_title in predicted:
        gold_index = extracted_to_gold.get(extracted_index)
        boundary = gold_by_line.get(gold_index) if gold_index is not None else None
        if (
            boundary is not None
            and boundary.lineIndex not in matched_gold
            and _normalized_distance(predicted_title, boundary.entryTitle)
            <= _BOUNDARY_TITLE_DISTANCE_LIMIT
        ):
            true_positives += 1
            matched_gold.add(boundary.lineIndex)
        else:
            false_positives += 1
    return true_positives, false_positives, len(gold.entryBoundaries) - len(matched_gold)


def _order_counts(extracted_lines: Sequence[Any], gold: OcrGoldPage) -> tuple[int, int]:
    anchors = [
        line.orderAnchor for line in gold.referenceLines if line.orderAnchor is not None
    ]
    total_pairs = max(len(anchors) - 1, 0)
    if total_pairs == 0:
        return 0, 0

    normalized_extracted = [_normalize_line(line.originalText) for line in extracted_lines]
    positions: list[int | None] = []
    for anchor in anchors:
        normalized_anchor = _normalize_line(anchor)
        occurrences: list[int] = []
        for index, line in enumerate(normalized_extracted):
            occurrences.extend([index] * line.count(normalized_anchor))
        positions.append(occurrences[0] if len(occurrences) == 1 else None)

    correct = sum(
        left is not None and right is not None and left < right
        for left, right in zip(positions, positions[1:])
    )
    return correct, total_pairs


def _page_counts(gold: OcrGoldPage, page: Any | None) -> tuple[_Counts, str, bool]:
    counts = _Counts(page_count=1)
    if page is None:
        extracted_lines: list[Any] = []
        text_source = "missing"
        failed = True
    else:
        extracted_lines = sorted(page.lines, key=lambda line: line.lineOrder)
        text_source = page.textSource
        failed = (
            page.documentId != gold.documentId
            or page.logicalPageNumber != gold.logicalPageNumber
            or page.sourcePdfPageNumber != gold.sourcePdfPageNumber
        )

    extracted_text = _normalized_page_text(
        [line.originalText for line in extracted_lines]
    )
    extracted_characters = sum(
        len(_normalize_line(line.originalText)) for line in extracted_lines
    )
    counts.extracted_characters = extracted_characters
    if page is not None:
        counts.low_confidence_characters = page.lowConfidenceRatio * extracted_characters

    if gold.pageClass == "blank":
        blank_ok = (
            page is not None
            and "blank" in page.qualityFlags
            and not any(line.role in ("body", "table") for line in extracted_lines)
        )
        failed = failed or not blank_ok
    else:
        reference_text = gold.referenceText
        counts.gold_characters = len(reference_text)
        counts.character_errors = levenshtein_distance(extracted_text, reference_text)
        counts.case_insensitive_character_errors = levenshtein_distance(
            extracted_text.casefold(), reference_text.casefold()
        )
        extracted_words = extracted_text.split()
        reference_words = reference_text.split()
        counts.gold_words = len(reference_words)
        counts.word_errors = _levenshtein_sequence(extracted_words, reference_words)

    counts.critical_annotations = len(gold.criticalTokens)
    counts.missing_critical_tokens = sum(
        _normalize_line(token) not in extracted_text for token in gold.criticalTokens
    )
    alignment = _align_lines(
        [line.originalText for line in extracted_lines],
        [line.text for line in gold.referenceLines],
    )
    counts.boundary_tp, counts.boundary_fp, counts.boundary_fn = _boundary_counts(
        extracted_lines, gold, alignment
    )
    counts.order_correct_pairs, counts.order_total_pairs = _order_counts(
        extracted_lines, gold
    )
    counts.failed_pages = int(failed)
    return counts, text_source, failed


def _levenshtein_sequence(left: Sequence[str], right: Sequence[str]) -> int:
    if left == right:
        return 0
    previous = list(range(len(right) + 1))
    for left_index, left_item in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_item in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1] + (left_item != right_item),
                )
            )
        previous = current
    return previous[-1]


def _validated_gold_pages(
    gold_pages: Sequence[OcrGoldPage],
) -> tuple[OcrGoldPage, ...]:
    if not isinstance(gold_pages, Sequence) or isinstance(gold_pages, (str, bytes)):
        raise OcrEvaluationError("gold pages must be a sequence")
    pages: list[OcrGoldPage] = []
    keys: set[tuple[str, int]] = set()
    for value in gold_pages:
        if not isinstance(value, OcrGoldPage):
            raise OcrEvaluationError("gold pages must contain OcrGoldPage values")
        key = (value.documentId, value.logicalPageNumber)
        if key in keys:
            raise OcrEvaluationError("gold document/page keys must be unique")
        keys.add(key)
        pages.append(value)
    if not 1 <= len(pages) <= _MAX_GOLD_ROWS:
        raise OcrEvaluationError("gold pages must contain 1..64 rows")
    return tuple(pages)


def evaluate_ocr(
    sample: OcrEvaluationSample,
    gold_pages: Sequence[OcrGoldPage],
    *,
    config: OcrGateConfig | None = None,
    evaluated_at: datetime | None = None,
) -> OcrEvaluationReport:
    if not isinstance(sample, OcrEvaluationSample):
        raise OcrEvaluationError("OCR evaluation requires OcrEvaluationSample")
    gold = _validated_gold_pages(gold_pages)
    selected: dict[tuple[str, int], Any] = {}
    document_id = sample.metadata.documentId
    for reference in sample.selectedPages:
        key = (document_id, reference.logicalPageNumber)
        if key in selected:
            raise OcrEvaluationError("selectedPages must be unique")
        selected[key] = reference
    gold_by_key = {(page.documentId, page.logicalPageNumber): page for page in gold}
    if set(gold_by_key) != set(selected):
        raise OcrEvaluationError("gold pages must match selectedPages one-to-one")
    for key, page in gold_by_key.items():
        if selected[key].pdfPage != page.sourcePdfPageNumber:
            raise OcrEvaluationError("gold sourcePdfPageNumber must match selectedPages")

    embedded: dict[tuple[str, int], Any] = {}
    for page in sample.pages:
        key = (page.documentId, page.logicalPageNumber)
        if key in embedded:
            raise OcrEvaluationError("embedded pages must be unique")
        embedded[key] = page

    global_counts = _Counts()
    class_counts: dict[str, _Counts] = {}
    source_counts: dict[str, _Counts] = {}
    page_results: list[OcrPageEvaluation] = []
    for gold_page in sorted(
        gold, key=lambda page: (page.logicalPageNumber, page.documentId)
    ):
        key = (gold_page.documentId, gold_page.logicalPageNumber)
        counts, text_source, failed = _page_counts(gold_page, embedded.get(key))
        global_counts.add(counts)
        class_counts.setdefault(gold_page.pageClass, _Counts()).add(counts)
        source_counts.setdefault(text_source, _Counts()).add(counts)
        page_results.append(
            OcrPageEvaluation(
                documentId=gold_page.documentId,
                logicalPageNumber=gold_page.logicalPageNumber,
                sourcePdfPageNumber=gold_page.sourcePdfPageNumber,
                pageClass=gold_page.pageClass,
                textSource=text_source,
                failed=failed,
                metrics=counts.metrics(),
            )
        )

    report_metrics = global_counts.metrics()
    selected_config = config or OcrGateConfig()
    timestamp = evaluated_at or datetime.now(timezone.utc)
    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        raise OcrEvaluationError("evaluation timestamp must include a timezone")
    gates = {
        "sampleSize": report_metrics.pageCount == selected_config.expectedPageCount,
        "failedPages": report_metrics.failedPages <= selected_config.maxFailedPages,
        "cer": report_metrics.cer <= selected_config.maxCer,
        "wer": report_metrics.wer <= selected_config.maxWer,
        "criticalTokenError": (
            report_metrics.criticalTokenError <= selected_config.maxCriticalTokenError
        ),
        "boundaryF1": report_metrics.boundaryF1 >= selected_config.minBoundaryF1,
        "readingOrderAccuracy": (
            report_metrics.readingOrderAccuracy
            >= selected_config.minReadingOrderAccuracy
        ),
    }
    return OcrEvaluationReport(
        schemaVersion=1,
        evaluatedAt=timestamp,
        config=selected_config,
        metrics=report_metrics,
        byPageClass={key: value.metrics() for key, value in sorted(class_counts.items())},
        byTextSource={key: value.metrics() for key, value in sorted(source_counts.items())},
        pages=page_results,
        gates=gates,
        passed=all(gates.values()),
    )
