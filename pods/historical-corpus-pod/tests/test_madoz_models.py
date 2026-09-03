from __future__ import annotations

from copy import deepcopy
import math

import pytest
from pydantic import ValidationError

from historical_corpus.models import (
    ChunkInput,
    ChunkRecord,
    DocumentMetadata,
    DocumentRecord,
    IngestRequest,
    NormalizedBox,
    PageRecord,
    PageSummary,
    PrintedRange,
    SearchHit,
    SearchRequest,
    SourceLineRecord,
)


SHA_0 = "sha256:" + "0" * 64
SHA_1 = "sha256:" + "1" * 64
SHA_2 = "sha256:" + "2" * 64
SHA_3 = "sha256:" + "3" * 64


def _legacy_ingest_payload() -> dict[str, object]:
    return {
        "documentId": "legacy-doc",
        "sourceUrl": "https://example.test/legacy.pdf",
        "title": "Legacy source",
        "author": "Historian",
        "edition": "First",
        "publicationYear": 1848,
        "language": "es",
        "countryCode": "ES",
        "sourceClass": "primary",
        "contentHash": SHA_0,
        "rights": {
            "status": "public-domain",
            "uri": "https://example.test/rights",
            "verifiedAt": "2026-09-02T20:00:00+00:00",
            "isExplicitlyReusable": True,
        },
        "chunks": [
            {
                "originalText": "MALAGA: ciudad histórica.",
                "correctedText": None,
                "pageStart": 32,
                "pageEnd": 32,
                "sectionPath": ["Diccionario", "Málaga"],
                "cityQids": ["Q8851"],
                "entityQids": [],
                "historicalPeriod": "1848",
                "ocrConfidence": 0.91,
            }
        ],
    }


def _prepared_metadata_payload() -> dict[str, object]:
    payload = _legacy_ingest_payload()
    payload.pop("chunks")
    payload.update(
        {
            "workId": "madoz-diccionario",
            "volumeNumber": 11,
            "repositoryName": "Google Books",
            "historicalPeriod": "1848",
            "temporalScope": "España, siglo XIX",
            "attribution": "Digitized by Google",
            "sourceIsExactRecord": True,
            "canonicalPdfSha256": SHA_0,
            "processingFingerprint": SHA_1,
            "pageInventorySha256": SHA_2,
            "coverageStatus": "partial_source",
            "coverageStatement": "Cobertura parcial del artículo de Málaga.",
            "observedPrintedRanges": [{"start": "32", "end": "61"}],
            "missingPrintedPages": ["62", "63"],
            "coverageAcceptedForProduct": True,
            "coverageAcceptedAt": "2026-09-02T20:00:00+00:00",
        }
    )
    return payload


def _page_summary_payload() -> dict[str, object]:
    metadata = _prepared_metadata_payload()
    rights = metadata.pop("rights")
    return {
        "pageId": SHA_3,
        "documentId": metadata["documentId"],
        "logicalPageNumber": 1,
        "sourcePdfPageNumber": 39,
        "leafSide": "full",
        "continuityBreakBefore": False,
        "printedPageLabel": "32",
        "contentClass": "normal",
        "textSource": "ppocrv6",
        "qualityScore": 0.9,
        "qualityFlags": [],
        "workId": metadata["workId"],
        "volumeNumber": metadata["volumeNumber"],
        "repositoryName": metadata["repositoryName"],
        "historicalPeriod": metadata["historicalPeriod"],
        "temporalScope": metadata["temporalScope"],
        "attribution": metadata["attribution"],
        "sourceIsExactRecord": metadata["sourceIsExactRecord"],
        "canonicalPdfSha256": metadata["canonicalPdfSha256"],
        "processingFingerprint": metadata["processingFingerprint"],
        "pageInventorySha256": metadata["pageInventorySha256"],
        "inventoryVerifiedAt": "2026-09-02T20:00:00+00:00",
        "sourceUrl": metadata["sourceUrl"],
        "rightsStatus": rights["status"],
        "rightsUri": rights["uri"],
        "rightsVerifiedAt": rights["verifiedAt"],
        "rightsIsExplicitlyReusable": rights["isExplicitlyReusable"],
        "coverageStatus": metadata["coverageStatus"],
        "coverageStatement": metadata["coverageStatement"],
        "observedPrintedRanges": metadata["observedPrintedRanges"],
        "missingPrintedPages": metadata["missingPrintedPages"],
        "coverageAcceptedForProduct": metadata["coverageAcceptedForProduct"],
        "coverageAcceptedAt": metadata["coverageAcceptedAt"],
    }


def _source_line_payload() -> dict[str, object]:
    return {
        "lineId": SHA_1,
        "lineOrder": 0,
        "originalText": "MALAGA: ciudad histórica.",
        "confidence": 0.95,
        "box": {"x0": 0.1, "y0": 0.2, "x1": 0.8, "y1": 0.3},
        "orientationDegrees": None,
        "role": "body",
    }


def _page_record_payload() -> dict[str, object]:
    return {
        **_page_summary_payload(),
        "cropBox": {"x0": 0.0, "y0": 0.0, "x1": 1.0, "y1": 1.0},
        "widthPx": 1800,
        "heightPx": 2400,
        "renderDpi": 300,
        "rasterizationPolicy": "pymupdf-page-render-v1",
        "rotationDegrees": 0,
        "imageSha256": SHA_2,
        "foregroundRatio": 0.2,
        "meanConfidence": 0.95,
        "lowConfidenceRatio": 0.01,
        "ocrEngine": "transformers",
        "ocrEngineVersion": "5.16.1",
        "ocrDetectionModel": "PP-OCRv6_medium_det",
        "ocrRecognitionModel": "PP-OCRv6_medium_rec",
        "originalText": "MALAGA: ciudad histórica.",
        "lines": [_source_line_payload()],
    }


def test_legacy_ingest_contract_is_additive_and_keeps_chunk_limit() -> None:
    payload = _legacy_ingest_payload()
    request = IngestRequest.model_validate(payload)

    dumped = request.model_dump()
    for key, value in payload.items():
        if key != "chunks":
            assert dumped[key] == value
    for key, value in payload["chunks"][0].items():
        assert dumped["chunks"][0][key] == value
    assert "document" not in dumped
    assert request.workId is None
    assert request.observedPrintedRanges == []
    assert request.missingPrintedPages == []

    too_many = deepcopy(payload)
    too_many["chunks"] = [deepcopy(payload["chunks"][0]) for _ in range(257)]
    with pytest.raises(ValidationError):
        IngestRequest.model_validate(too_many)


def test_http_ingest_accepts_descriptive_fields_but_rejects_prepared_fields() -> None:
    payload = _legacy_ingest_payload()
    payload.update(
        {
            "workId": "madoz",
            "volumeNumber": 11,
            "repositoryName": "Repository",
            "historicalPeriod": "1848",
            "temporalScope": "siglo XIX",
            "attribution": "Attribution",
        }
    )
    payload["chunks"][0]["entryTitle"] = "MALAGA"
    assert IngestRequest.model_validate(payload).chunks[0].entryTitle == "MALAGA"

    forbidden_values: dict[str, object] = {
        "sourceIsExactRecord": True,
        "canonicalPdfSha256": SHA_0,
        "processingFingerprint": SHA_1,
        "pageInventorySha256": SHA_2,
        "coverageStatus": "partial_source",
        "coverageStatement": "partial",
        "observedPrintedRanges": [{"start": "1", "end": "2"}],
        "missingPrintedPages": ["3"],
        "coverageAcceptedForProduct": False,
        "coverageAcceptedAt": "2026-09-02T20:00:00+00:00",
    }
    for field, value in forbidden_values.items():
        candidate = deepcopy(payload)
        candidate[field] = value
        with pytest.raises(ValidationError, match="prepare|publish|prepared"):
            IngestRequest.model_validate(candidate)

    unknown = deepcopy(payload)
    unknown["unexpected"] = True
    with pytest.raises(ValidationError):
        IngestRequest.model_validate(unknown)

    line_ids = deepcopy(payload)
    line_ids["chunks"][0]["lineIds"] = [SHA_1]
    with pytest.raises(ValidationError):
        IngestRequest.model_validate(line_ids)


@pytest.mark.parametrize(
    "value",
    [
        {"start": "0", "end": "1"},
        {"start": "01", "end": "2"},
        {"start": "10000", "end": "10000"},
        {"start": "10", "end": "9"},
    ],
)
def test_printed_range_rejects_invalid_labels_and_order(value: dict[str, str]) -> None:
    with pytest.raises(ValidationError):
        PrintedRange.model_validate(value)


def test_normalized_box_requires_finite_ordered_unit_coordinates() -> None:
    assert NormalizedBox(x0=0.0, y0=0.1, x1=0.9, y1=1.0).x1 == 0.9
    invalid = [
        {"x0": -0.1, "y0": 0.0, "x1": 1.0, "y1": 1.0},
        {"x0": 0.5, "y0": 0.0, "x1": 0.5, "y1": 1.0},
        {"x0": 0.0, "y0": 0.8, "x1": 1.0, "y1": 0.7},
        {"x0": 0.0, "y0": 0.0, "x1": math.nan, "y1": 1.0},
        {"x0": 0.0, "y0": 0.0, "x1": math.inf, "y1": 1.0},
    ]
    for value in invalid:
        with pytest.raises(ValidationError):
            NormalizedBox.model_validate(value)


def test_coverage_metadata_is_coherent_and_ordered() -> None:
    valid = _prepared_metadata_payload()
    assert DocumentMetadata.model_validate(valid).coverageStatus == "partial_source"

    mutations: list[tuple[str, object]] = [
        ("coverageStatus", "invalid"),
        ("coverageStatement", None),
        ("missingPrintedPages", []),
        ("missingPrintedPages", ["63", "62"]),
        ("missingPrintedPages", ["62", "62"]),
        ("missingPrintedPages", ["40"]),
        ("coverageAcceptedAt", "2026-09-02T20:00:00"),
    ]
    for field, value in mutations:
        candidate = deepcopy(valid)
        candidate[field] = value
        with pytest.raises(ValidationError):
            DocumentMetadata.model_validate(candidate)

    unaccepted = deepcopy(valid)
    unaccepted["coverageAcceptedForProduct"] = False
    with pytest.raises(ValidationError):
        DocumentMetadata.model_validate(unaccepted)

    complete = deepcopy(valid)
    complete.update(
        {
            "coverageStatus": "complete_source",
            "coverageStatement": None,
            "missingPrintedPages": [],
        }
    )
    assert DocumentMetadata.model_validate(complete).coverageStatus == "complete_source"

    unknown = deepcopy(complete)
    unknown.update(
        {
            "coverageStatus": "unknown",
            "coverageAcceptedForProduct": True,
        }
    )
    with pytest.raises(ValidationError):
        DocumentMetadata.model_validate(unknown)

    overlap = deepcopy(valid)
    overlap["observedPrintedRanges"] = [
        {"start": "32", "end": "50"},
        {"start": "50", "end": "61"},
    ]
    with pytest.raises(ValidationError):
        DocumentMetadata.model_validate(overlap)


def test_page_summary_embedded_source_contract() -> None:
    payload = _page_summary_payload()
    payload["textSource"] = "embedded"
    summary = PageSummary.model_validate(payload)
    assert summary.textSource == "embedded"


def test_page_summary_ppocrv6_with_embedded_fallback_flag() -> None:
    payload = _page_summary_payload()
    payload["textSource"] = "ppocrv6"
    payload["qualityFlags"] = ["embedded_fallback_missing_text"]
    summary = PageSummary.model_validate(payload)
    assert summary.textSource == "ppocrv6"
    assert summary.qualityFlags == ["embedded_fallback_missing_text"]


def test_page_models_validate_provenance_geometry_and_finite_values() -> None:
    line = SourceLineRecord.model_validate(_source_line_payload())
    summary = PageSummary.model_validate(_page_summary_payload())
    record = PageRecord.model_validate(_page_record_payload())
    assert line.role == "body"
    assert summary.textSource == "ppocrv6"
    assert record.lines[0].lineOrder == 0

    for leaf_side in ["left", "right", "full"]:
        candidate = _page_summary_payload()
        candidate["leafSide"] = leaf_side
        assert PageSummary.model_validate(candidate).leafSide == leaf_side
    for content_class in ["normal", "table", "mixed_orientation"]:
        candidate = _page_summary_payload()
        candidate["contentClass"] = content_class
        assert PageSummary.model_validate(candidate).contentClass == content_class
    without_printed_label = _page_summary_payload()
    without_printed_label["printedPageLabel"] = None
    assert PageSummary.model_validate(without_printed_label).printedPageLabel is None

    empty_page = _page_record_payload()
    empty_page["originalText"] = ""
    empty_page["lines"] = []
    assert PageRecord.model_validate(empty_page).lines == []

    invalid_cases = [
        (SourceLineRecord, _source_line_payload(), "lineId", "SHA256:" + "0" * 64),
        (SourceLineRecord, _source_line_payload(), "confidence", math.nan),
        (SourceLineRecord, _source_line_payload(), "role", "margin"),
        (PageSummary, _page_summary_payload(), "printedPageLabel", "032"),
        (PageSummary, _page_summary_payload(), "qualityScore", math.inf),
        (PageSummary, _page_summary_payload(), "leafSide", "center"),
        (PageSummary, _page_summary_payload(), "leafSide", "recto"),
        (PageSummary, _page_summary_payload(), "contentClass", "plate"),
        (PageSummary, _page_summary_payload(), "textSource", "tesseract"),
        (PageSummary, _page_summary_payload(), "workId", None),
        (PageSummary, _page_summary_payload(), "canonicalPdfSha256", None),
        (PageSummary, _page_summary_payload(), "qualityFlags", ["table_heavy", "blank"]),
        (PageRecord, _page_record_payload(), "rotationDegrees", 45),
        (PageRecord, _page_record_payload(), "foregroundRatio", -0.1),
        (PageRecord, _page_record_payload(), "meanConfidence", math.nan),
        (PageRecord, _page_record_payload(), "widthPx", 0),
    ]
    for model, base, field, value in invalid_cases:
        candidate = deepcopy(base)
        candidate[field] = value
        with pytest.raises(ValidationError):
            model.model_validate(candidate)


def _document_record_payload() -> dict[str, object]:
    return {
        "documentId": "legacy-doc",
        "sourceUrl": "https://example.test/legacy.pdf",
        "title": "Legacy source",
        "author": "Historian",
        "edition": "First",
        "publicationYear": 1848,
        "language": "es",
        "countryCode": "ES",
        "sourceClass": "primary",
        "contentHash": SHA_0,
        "rightsStatus": "public-domain",
        "rightsUri": "https://example.test/rights",
        "rightsVerifiedAt": "2026-09-02T20:00:00+00:00",
        "rightsIsExplicitlyReusable": True,
    }


def _chunk_record_payload() -> dict[str, object]:
    return {
        "chunkId": SHA_1,
        "documentId": "legacy-doc",
        "originalText": "MALAGA: ciudad histórica.",
        "correctedText": None,
        "pageStart": 32,
        "pageEnd": 32,
        "sectionPath": ["Diccionario", "Málaga"],
        "cityQids": ["Q8851"],
        "entityQids": [],
        "historicalPeriod": "1848",
        "ocrConfidence": 0.91,
        "language": "es",
        "sourceClass": "primary",
        "rightsStatus": "public-domain",
        "publicationYear": 1848,
        "sourceUrl": "https://example.test/legacy.pdf",
        "title": "Legacy source",
        "textHash": SHA_2,
        "contentHash": SHA_0,
        "rightsUri": "https://example.test/rights",
        "rightsVerifiedAt": "2026-09-02T20:00:00+00:00",
    }


def _search_hit_payload() -> dict[str, object]:
    chunk = _chunk_record_payload()
    return {
        "chunkId": chunk["chunkId"],
        "documentId": chunk["documentId"],
        "pageStart": chunk["pageStart"],
        "pageEnd": chunk["pageEnd"],
        "textHash": chunk["textHash"],
        "contentHash": chunk["contentHash"],
        "sourceUrl": chunk["sourceUrl"],
        "title": chunk["title"],
        "rightsStatus": chunk["rightsStatus"],
        "lexicalScore": 0.5,
        "denseScore": 0.4,
        "fusionScore": 0.3,
        "rerankScore": 0.2,
        "matchedEntityQids": [],
        "text": chunk["originalText"],
        "sectionPath": chunk["sectionPath"],
        "cityQids": chunk["cityQids"],
        "entityQids": chunk["entityQids"],
        "language": chunk["language"],
        "sourceClass": chunk["sourceClass"],
        "publicationYear": chunk["publicationYear"],
        "historicalPeriod": chunk["historicalPeriod"],
        "ocrConfidence": chunk["ocrConfidence"],
        "rightsUri": chunk["rightsUri"],
        "rightsVerifiedAt": chunk["rightsVerifiedAt"],
    }


def test_legacy_records_receive_safe_additive_defaults() -> None:
    document = DocumentRecord.model_validate(_document_record_payload())
    chunk = ChunkRecord.model_validate(_chunk_record_payload())
    hit = SearchHit.model_validate(_search_hit_payload())

    assert document.workId is None
    assert document.observedPrintedRanges == []
    assert chunk.entryTitle is None
    assert chunk.lineIds == []
    assert chunk.rightsIsExplicitlyReusable is True
    assert hit.lineIds == []
    assert hit.rightsIsExplicitlyReusable is True


@pytest.mark.parametrize(
    "field",
    ["workId", "repositoryName", "historicalPeriod", "temporalScope", "attribution"],
)
def test_new_metadata_strings_reject_empty_values(field: str) -> None:
    payload = _legacy_ingest_payload()
    payload[field] = ""
    with pytest.raises(ValidationError):
        IngestRequest.model_validate(payload)


@pytest.mark.parametrize("field", ["ocrConfidence", "lexicalScore", "denseScore", "fusionScore", "rerankScore"])
def test_record_scores_reject_non_finite_values(field: str) -> None:
    if field == "ocrConfidence":
        payload = _chunk_record_payload()
        payload[field] = math.nan
        with pytest.raises(ValidationError):
            ChunkRecord.model_validate(payload)
    else:
        payload = _search_hit_payload()
        payload[field] = math.inf
        with pytest.raises(ValidationError):
            SearchHit.model_validate(payload)


@pytest.mark.parametrize("value", [-0.1, 1.1, math.nan, math.inf])
def test_record_ocr_confidence_stays_a_finite_unit_ratio(value: float) -> None:
    chunk_payload = _chunk_record_payload()
    chunk_payload["ocrConfidence"] = value
    with pytest.raises(ValidationError):
        ChunkRecord.model_validate(chunk_payload)

    hit_payload = _search_hit_payload()
    hit_payload["ocrConfidence"] = value
    with pytest.raises(ValidationError):
        SearchHit.model_validate(hit_payload)


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_http_float_inputs_reject_non_finite_values(value: float) -> None:
    chunk_payload = _legacy_ingest_payload()["chunks"][0]
    chunk_payload["ocrConfidence"] = value
    with pytest.raises(ValidationError):
        ChunkInput.model_validate(chunk_payload)

    with pytest.raises(ValidationError):
        SearchRequest(query="Málaga", minOcrConfidence=value)
