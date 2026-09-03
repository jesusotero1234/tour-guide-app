from __future__ import annotations

import hashlib
import json
from copy import deepcopy

import pytest

from historical_corpus.ingest_models import PageInventoryRecord
from historical_corpus.manifest import MadozManifest
from historical_corpus.page_inventory import (
    PageInventoryError,
    apply_duplicate_decisions,
    build_inventory_signals,
    embedded_text_fingerprints,
    extract_printed_label_candidates,
    finalize_inventory,
    inventory_sha256,
    load_verified_inventory,
    normalize_embedded_text,
    serialize_inventory_jsonl,
)
from historical_corpus.pdf_source import (
    CandidateLeaf,
    DominantRasterMetadata,
    EmbeddedWord,
    LeafSide,
    RenderedLeaf,
)


def _manifest_data(
    *,
    page_overrides: list[dict[str, object]] | None = None,
    duplicate_decisions: list[dict[str, object]] | None = None,
    candidate_ranges: list[dict[str, int]] | None = None,
    coverage: dict[str, object] | None = None,
    inventory_review_status: str | None = None,
    expected_inventory_sha256: str | None = None,
    inventory_verified_at: str | None = None,
) -> dict[str, object]:
    return {
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
            "candidatePdfPageRanges": candidate_ranges or [{"start": 1, "end": 3}],
            "pageInventoryPath": "inventory/pages.jsonl",
            "expectedPageInventorySha256": expected_inventory_sha256,
            "inventoryReviewStatus": inventory_review_status or "pending",
            "inventoryVerifiedAt": inventory_verified_at,
            "canonicalization": {
                "defaultStatus": "include",
                "defaultOrder": "source_order",
                "duplicateDecisions": duplicate_decisions or [],
                "pageOverrides": page_overrides or [],
            },
            "splitSpreads": False,
            "gutterRatio": 0.5,
            "innerGutterTrimRatio": 0.005,
            "leafOverrides": [],
        },
        "coverage": coverage or {
            "status": "unknown",
            "statement": None,
            "observedPrintedRanges": [],
            "missingPrintedPages": [],
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
            "maxChunkChars": 1500,
            "overlapLines": 2,
            "layoutPolicy": "madoz-two-column-v1",
            "entryPolicy": "madoz-entry-v1",
        },
    }


def _manifest(
    *,
    page_overrides: list[dict[str, object]] | None = None,
    duplicate_decisions: list[dict[str, object]] | None = None,
    candidate_ranges: list[dict[str, int]] | None = None,
    coverage: dict[str, object] | None = None,
    inventory_review_status: str | None = None,
    expected_inventory_sha256: str | None = None,
    inventory_verified_at: str | None = None,
) -> MadozManifest:
    return MadozManifest.model_validate(
        _manifest_data(
            page_overrides=page_overrides,
            duplicate_decisions=duplicate_decisions,
            candidate_ranges=candidate_ranges,
            coverage=coverage,
            inventory_review_status=inventory_review_status,
            expected_inventory_sha256=expected_inventory_sha256,
            inventory_verified_at=inventory_verified_at,
        )
    )


def _revalidated(
    record: PageInventoryRecord,
    **updates: object,
) -> PageInventoryRecord:
    data = record.model_dump(mode="json")
    data.update(updates)
    return PageInventoryRecord.model_validate(data)


def _pending_record(
    pdf_page: int,
    *,
    label: str | None,
    anomaly: str | None,
    status: str,
    duplicate_of: tuple[int, str] | None,
) -> PageInventoryRecord:
    base = build_inventory_signals((_rendered(pdf_page),), _manifest())[0]
    return _revalidated(
        base,
        normalizedPrintedLabel=label,
        printedLabelBox=None,
        printedLabelSource="missing" if label is None else "embedded_ocr_heuristic",
        anomalyFlags=[anomaly] if anomaly is not None else [],
        canonicalStatus=status,
        duplicateOf=(
            {"pdfPage": duplicate_of[0], "side": duplicate_of[1]}
            if duplicate_of is not None
            else None
        ),
        canonicalSequenceIndex=None,
        continuityBreakBefore=False,
        decisionReason=(
            "Excluded from body content by a human"
            if status == "exclude_nonbody"
            else base.decisionReason
        ),
    )


def _rendered(
    pdf_page: int,
    *,
    words: tuple[EmbeddedWord, ...] = (),
    side: LeafSide = "full",
) -> RenderedLeaf:
    return RenderedLeaf(
        candidate=CandidateLeaf(
            pdf_page=pdf_page,
            side=side,
            crop_box=(0.0, 0.0, 1.0, 1.0),
            rotation_degrees=0,
            content_class="normal",
            table_regions=(),
        ),
        width_px=300,
        height_px=400,
        render_dpi=300,
        rasterization_policy="pymupdf-page-render-v1",
        rgb_bytes=b"",
        image_sha256=f"{pdf_page:x}" * 64,
        visual_dhash64=f"{pdf_page:x}" * 16,
        embedded_words=words,
        dominant_raster=DominantRasterMetadata(
            width_px=1200,
            height_px=1800,
            bits_per_component=1,
            filter="JBIG2Decode",
            declared_dpi_x=600.0,
            declared_dpi_y=600.0,
        ),
        media_box=(0.0, 0.0, 216.0, 288.0),
        pdf_rotation_degrees=0,
    )


def _word(text: str, y0: float, y1: float) -> EmbeddedWord:
    return EmbeddedWord(text=text, box=(0.1, y0, 0.2, y1))


def test_embedded_text_fingerprints_have_fixed_vectors() -> None:
    words = (_word("A\u0301RBOL", 0.2, 0.3), _word("de", 0.3, 0.4), _word("Madrid", 0.4, 0.5))

    assert normalize_embedded_text(word.text for word in words) == "árbol de madrid"
    assert embedded_text_fingerprints(words) == (
        "sha256:d003170796c0b229091869d8deed59605d6174482beb9c6d9df78398c4563242",
        "d003170796c0b229",
    )
    punctuated = (
        _word("uno,", 0.2, 0.3),
        _word("dos", 0.3, 0.4),
        _word("tres!", 0.4, 0.5),
    )
    assert embedded_text_fingerprints(punctuated) == (
        "sha256:1058282c1456b29d455881a4aeff94c3d266cf3b386da10637a0b7027d859621",
        "997609a0be65e6b8",
    )
    assert embedded_text_fingerprints(()) == (None, None)
    assert embedded_text_fingerprints((_word("solo", 0.2, 0.3),)) == (
        "sha256:5364f2f2fc4f54e9d47ad29cfb08ef430c8153394bf2a0dff5cbe77a0ffef861",
        None,
    )


def test_printed_label_heuristic_uses_only_page_edges() -> None:
    single = extract_printed_label_candidates(
        (
            _word("0032.", 0.02, 0.06),
            EmbeddedWord(text="888", box=(0.4, 0.02, 0.5, 0.06)),
            _word("999", 0.07, 0.08),
            _word("777", 0.4, 0.5),
            _word("folio", 0.95, 0.98),
        )
    )
    assert [candidate.text for candidate in single.candidates] == ["0032."]
    assert single.normalized_label == "32"
    assert single.normalized_box == (0.1, 0.02, 0.2, 0.06)
    assert single.anomaly is None

    missing = extract_printed_label_candidates((_word("folio", 0.01, 0.05),))
    assert missing.candidates == ()
    assert missing.normalized_label is None
    assert missing.anomaly == "label_missing"

    ambiguous = extract_printed_label_candidates(
        (_word("12", 0.01, 0.05), _word("13.", 0.93, 0.98))
    )
    assert [candidate.text for candidate in ambiguous.candidates] == ["12", "13."]
    assert ambiguous.normalized_label is None
    assert ambiguous.anomaly == "label_ambiguous"


def test_inventory_signal_records_map_physical_and_hash_fields() -> None:
    first = _rendered(
        1,
        words=(
            _word("41.", 0.02, 0.05),
            _word("Villa", 0.2, 0.3),
            _word("de", 0.3, 0.4),
            _word("Madrid", 0.4, 0.5),
        ),
    )
    second = _rendered(2)

    records = build_inventory_signals((first, second), _manifest())

    assert all(isinstance(record, PageInventoryRecord) for record in records)
    assert [(record.pdfPage, record.side) for record in records] == [(1, "full"), (2, "full")]
    record = records[0]
    assert record.mediaBox == (0.0, 0.0, 216.0, 288.0)
    assert record.pdfRotationDegrees == 0
    assert (record.rasterWidthPx, record.rasterHeightPx) == (1200, 1800)
    assert record.rasterBitsPerComponent == 1
    assert record.rasterFilter == "JBIG2Decode"
    assert (record.declaredDpiX, record.declaredDpiY) == (600.0, 600.0)
    assert record.sourceImageSha256 == "sha256:" + "1" * 64
    assert record.visualDhash64 == "1" * 16
    assert record.embeddedTextSha256 is not None
    assert record.textSimhash64 is not None
    assert record.normalizedPrintedLabel == "41"
    assert record.printedLabelSource == "embedded_ocr_heuristic"
    assert record.canonicalStatus == "pending_review"
    assert record.duplicateCandidates == []
    assert record.duplicateOf is None
    assert record.canonicalSequenceIndex is None
    assert record.continuityBreakBefore is False

    assert records[1].anomalyFlags == ["label_missing"]


def test_manifest_overrides_resolve_labels_and_status() -> None:
    rendered = (_rendered(1), _rendered(2, words=(_word("7", 0.01, 0.05),)),)
    manifest = _manifest(
        page_overrides=[
            {
                "pdfPage": 1,
                "side": "full",
                "normalizedPrintedLabel": "42",
                "canonicalStatus": None,
                "reason": "Label read by a human reviewer",
            },
            {
                "pdfPage": 2,
                "side": "full",
                "normalizedPrintedLabel": None,
                "canonicalStatus": "exclude_nonbody",
                "reason": "Binding leaf, not body content",
            },
        ]
    )

    records = build_inventory_signals(rendered, manifest)

    assert records[0].normalizedPrintedLabel == "42"
    assert records[0].printedLabelSource == "manifest_override"
    assert records[0].printedLabelBox is None
    assert records[0].anomalyFlags == []
    assert records[0].decisionReason == "Label read by a human reviewer"
    assert records[1].canonicalStatus == "exclude_nonbody"
    assert records[1].decisionReason == "Binding leaf, not body content"


def test_label_candidate_limit_is_fail_closed() -> None:
    words = tuple(
        EmbeddedWord(text=str(index + 1), box=(0.0, 0.01, 0.1, 0.02))
        for index in range(33)
    )
    with pytest.raises(PageInventoryError, match="32"):
        build_inventory_signals((_rendered(1, words=words),), _manifest())


def test_signal_bytes_ignore_source_and_review_metadata() -> None:
    rendered = (_rendered(1, words=(_word("9", 0.01, 0.05),)),)
    first = _manifest()
    changed_data = deepcopy(_manifest_data())
    changed_source = changed_data["source"]
    changed_selection = changed_data["selection"]
    assert isinstance(changed_source, dict)
    assert isinstance(changed_selection, dict)
    changed_source["expectedSha256"] = "f" * 64
    changed_source["rights"] = {
        "status": "reviewed_not_reusable",
        "uri": "https://example.org/changed-rights",
        "verifiedAt": "2026-09-03T12:00:00+02:00",
        "isExplicitlyReusable": False,
    }
    changed_selection["expectedPageInventorySha256"] = "e" * 64
    changed_selection["inventoryReviewStatus"] = "verified"
    changed_selection["inventoryVerifiedAt"] = "2026-09-03T12:00:00+02:00"
    second = MadozManifest.model_validate(changed_data)

    first_dump = [record.model_dump(mode="json") for record in build_inventory_signals(rendered, first)]
    second_dump = [record.model_dump(mode="json") for record in build_inventory_signals(rendered, second)]
    assert first_dump == second_dump


def _duplicate_record(
    pdf_page: int,
    *,
    label: str | None,
    embedded_sha: str | None,
    simhash: str | None,
    dhash: str,
) -> PageInventoryRecord:
    record = build_inventory_signals((_rendered(pdf_page),), _manifest())[0]
    return _revalidated(
        record,
        normalizedPrintedLabel=label,
        printedLabelBox=None,
        printedLabelSource=(
            "embedded_ocr_heuristic" if label is not None else "missing"
        ),
        embeddedTextSha256=embedded_sha,
        textSimhash64=simhash,
        visualDhash64=dhash,
        anomalyFlags=[],
    )


def _decision(
    first: int,
    second: int,
    *,
    decision: str,
    canonical: int | None,
) -> dict[str, object]:
    return {
        "first": {"pdfPage": first, "side": "full"},
        "second": {"pdfPage": second, "side": "full"},
        "decision": decision,
        "canonical": (
            {"pdfPage": canonical, "side": "full"} if canonical is not None else None
        ),
        "reason": "Reviewed by a human",
    }


@pytest.mark.parametrize(
    ("left", "right", "expected_reasons"),
    [
        (
            {"label": "10", "embedded_sha": "sha256:" + "a" * 64, "simhash": "0" * 16, "dhash": "0" * 16},
            {"label": "10", "embedded_sha": "sha256:" + "a" * 64, "simhash": "f" * 16, "dhash": "f" * 16},
            ["same_embedded_text_sha", "same_label"],
        ),
        (
            {"label": "10", "embedded_sha": "sha256:" + "a" * 64, "simhash": "0000000000000000", "dhash": "f" * 16},
            {"label": "10", "embedded_sha": "sha256:" + "b" * 64, "simhash": "0000000000000007", "dhash": "0" * 16},
            ["same_label", "simhash_le_3"],
        ),
        (
            {"label": "10", "embedded_sha": None, "simhash": "f" * 16, "dhash": "0000000000000000"},
            {"label": "10", "embedded_sha": None, "simhash": "0" * 16, "dhash": "000000000000001f"},
            ["dhash_le_5", "same_label"],
        ),
        (
            {"label": "10", "embedded_sha": None, "simhash": "0000000000000000", "dhash": "0000000000000000"},
            {"label": "11", "embedded_sha": None, "simhash": "0000000000000007", "dhash": "000000000000001f"},
            ["dhash_le_5", "simhash_le_3"],
        ),
        (
            {"label": "10", "embedded_sha": None, "simhash": "0000000000000000", "dhash": "0000000000000000"},
            {"label": "11", "embedded_sha": None, "simhash": "0000000000000007", "dhash": "000000000000003f"},
            None,
        ),
    ],
)
def test_duplicate_thresholds_and_sorted_reasons(
    left: dict[str, object],
    right: dict[str, object],
    expected_reasons: list[str] | None,
) -> None:
    records = [
        _duplicate_record(1, **left),
        _duplicate_record(2, **right),
    ]

    result = apply_duplicate_decisions(records, _manifest())

    if expected_reasons is None:
        assert result[0].duplicateCandidates == []
        assert result[1].duplicateCandidates == []
        return
    first_candidate = result[0].duplicateCandidates[0]
    second_candidate = result[1].duplicateCandidates[0]
    assert (first_candidate.pdfPage, first_candidate.side) == (2, "full")
    assert (second_candidate.pdfPage, second_candidate.side) == (1, "full")
    assert first_candidate.reasons == expected_reasons
    assert second_candidate.reasons == expected_reasons
    assert first_candidate.decision == "pending"
    assert first_candidate.canonical is None
    assert first_candidate.decisionReason is None


def test_undecided_duplicate_is_only_an_alert() -> None:
    records = [
        _duplicate_record(1, label="10", embedded_sha=None, simhash="0" * 16, dhash="0" * 16),
        _duplicate_record(2, label="11", embedded_sha=None, simhash="0000000000000007", dhash="000000000000001f"),
    ]

    result = apply_duplicate_decisions(records, _manifest())

    assert [record.canonicalStatus for record in result] == [
        "pending_review",
        "pending_review",
    ]
    assert all(record.duplicateOf is None for record in result)
    assert all("near_duplicate" in record.anomalyFlags for record in result)


def test_duplicate_candidate_pair_limit_is_fail_closed() -> None:
    base = _duplicate_record(
        1,
        label="10",
        embedded_sha="sha256:" + "a" * 64,
        simhash=None,
        dhash="0" * 16,
    )
    records = [_revalidated(base, pdfPage=page) for page in range(1, 66)]
    manifest = _manifest(candidate_ranges=[{"start": 1, "end": 65}])
    with pytest.raises(PageInventoryError, match="2000"):
        apply_duplicate_decisions(records, manifest)


def test_false_positive_retains_evidence_without_excluding() -> None:
    records = [
        _duplicate_record(1, label="10", embedded_sha="sha256:" + "a" * 64, simhash=None, dhash="0" * 16),
        _duplicate_record(2, label="10", embedded_sha="sha256:" + "a" * 64, simhash=None, dhash="f" * 16),
    ]
    manifest = _manifest(
        duplicate_decisions=[
            _decision(1, 2, decision="false_positive", canonical=None)
        ]
    )

    result = apply_duplicate_decisions(records, manifest)

    assert all(record.canonicalStatus == "pending_review" for record in result)
    assert all(record.duplicateOf is None for record in result)
    assert all("near_duplicate" not in record.anomalyFlags for record in result)
    for record in result:
        evidence = record.duplicateCandidates[0]
        assert evidence.decision == "false_positive"
        assert evidence.canonical is None
        assert evidence.decisionReason == "Reviewed by a human"
        assert record.decisionReason is None


def _duplicate_chain() -> list[PageInventoryRecord]:
    return [
        _duplicate_record(1, label="10", embedded_sha=None, simhash=None, dhash="0000000000000000"),
        _duplicate_record(2, label="10", embedded_sha=None, simhash=None, dhash="000000000000001f"),
        _duplicate_record(3, label="10", embedded_sha=None, simhash=None, dhash="00000000000003ff"),
    ]


def _chain_decisions(*, second_canonical: int = 1) -> list[dict[str, object]]:
    return [
        _decision(1, 2, decision="confirmed_duplicate", canonical=1),
        _decision(2, 3, decision="confirmed_duplicate", canonical=second_canonical),
    ]


def test_confirmed_chain_uses_one_human_canonical() -> None:
    result = apply_duplicate_decisions(
        _duplicate_chain(),
        _manifest(duplicate_decisions=_chain_decisions()),
    )

    assert result[0].canonicalStatus == "pending_review"
    assert result[0].duplicateOf is None
    for record in result[1:]:
        assert record.canonicalStatus == "exclude_duplicate"
        assert record.duplicateOf is not None
        assert (record.duplicateOf.pdfPage, record.duplicateOf.side) == (1, "full")
    assert all("near_duplicate" not in record.anomalyFlags for record in result)
    assert [len(record.duplicateCandidates) for record in result] == [1, 2, 1]


def test_undetected_confirmed_duplicate_is_accepted() -> None:
    records = [
        _duplicate_record(1, label="10", embedded_sha=None, simhash="0" * 16, dhash="0" * 16),
        _duplicate_record(2, label="11", embedded_sha=None, simhash="f" * 16, dhash="f" * 16),
    ]
    manifest = _manifest(
        duplicate_decisions=[
            _decision(1, 2, decision="confirmed_duplicate", canonical=1)
        ]
    )

    result = apply_duplicate_decisions(records, manifest)

    assert result[0].canonicalStatus == "pending_review"
    assert result[0].duplicateOf is None
    assert result[1].canonicalStatus == "exclude_duplicate"
    assert result[1].duplicateOf is not None
    assert (result[1].duplicateOf.pdfPage, result[1].duplicateOf.side) == (1, "full")
    for record in result:
        candidate = record.duplicateCandidates[0]
        assert "manual_review" in candidate.reasons
        assert candidate.decision == "confirmed_duplicate"
        assert candidate.decisionReason == "Reviewed by a human"


def test_undetected_false_positive_is_rejected() -> None:
    records = [
        _duplicate_record(1, label="10", embedded_sha=None, simhash="0" * 16, dhash="0" * 16),
        _duplicate_record(2, label="11", embedded_sha=None, simhash="f" * 16, dhash="f" * 16),
    ]
    manifest = _manifest(
        duplicate_decisions=[
            _decision(1, 2, decision="false_positive", canonical=None)
        ]
    )
    with pytest.raises(PageInventoryError, match="not a detected candidate"):
        apply_duplicate_decisions(records, manifest)


def test_confirmed_component_rejects_inconsistent_or_outside_canonical() -> None:
    with pytest.raises(PageInventoryError, match="same canonical"):
        apply_duplicate_decisions(
            _duplicate_chain(),
            _manifest(
                duplicate_decisions=_chain_decisions(second_canonical=3)
            ),
        )

    records = _duplicate_chain()
    manifest = _manifest(
        duplicate_decisions=[
            _decision(1, 2, decision="confirmed_duplicate", canonical=3)
        ]
    )
    with pytest.raises(PageInventoryError, match="canonical.*component"):
        apply_duplicate_decisions(records, manifest)


@pytest.mark.parametrize(
    "override",
    [
        {
            "pdfPage": 2,
            "side": "full",
            "normalizedPrintedLabel": None,
            "canonicalStatus": "include",
            "reason": "Force duplicate into output",
        },
        {
            "pdfPage": 1,
            "side": "full",
            "normalizedPrintedLabel": None,
            "canonicalStatus": "exclude_nonbody",
            "reason": "Exclude chosen canonical",
        },
    ],
)
def test_confirmed_component_rejects_contradictory_override(
    override: dict[str, object],
) -> None:
    manifest = _manifest(
        duplicate_decisions=[
            _decision(1, 2, decision="confirmed_duplicate", canonical=1)
        ],
        page_overrides=[override],
    )
    with pytest.raises(PageInventoryError, match="contradict"):
        apply_duplicate_decisions(_duplicate_chain()[:2], manifest)


def test_eligible_physical_order_excludes_nonbody_and_duplicate() -> None:
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="11", anomaly=None, status="exclude_nonbody", duplicate_of=None),
        _pending_record(3, label="12", anomaly=None, status="exclude_duplicate", duplicate_of=(1, "full")),
        _pending_record(4, label="11", anomaly=None, status="pending_review", duplicate_of=None),
    ]
    result = finalize_inventory(
        records, _manifest(candidate_ranges=[{"start": 1, "end": 4}])
    )
    assert [record.pdfPage for record in result] == [1, 2, 3, 4]
    assert [record.canonicalSequenceIndex for record in result] == [1, None, None, 2]
    assert "candidate_range_break" not in result[3].anomalyFlags


def test_equal_labels_mark_repeat_and_descending_labels_decrease() -> None:
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(3, label="9", anomaly=None, status="pending_review", duplicate_of=None),
    ]
    result = finalize_inventory(records, _manifest())
    assert "repeat" in result[1].anomalyFlags
    assert "decrease" in result[2].anomalyFlags
    assert all(record.canonicalStatus == "pending_review" for record in result)
    assert all(record.canonicalSequenceIndex is None for record in result)


def test_skipped_labels_create_gap() -> None:
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="12", anomaly=None, status="pending_review", duplicate_of=None),
    ]
    result = finalize_inventory(
        records, _manifest(candidate_ranges=[{"start": 1, "end": 2}])
    )
    assert "gap" in result[1].anomalyFlags
    assert all(record.canonicalStatus == "pending_review" for record in result)
    assert all(record.canonicalSequenceIndex is None for record in result)


def test_skipped_integers_match_coverage_missing_pages_become_declared_gap() -> None:
    coverage = {
        "status": "partial_source",
        "statement": "Missing pages 11",
        "observedPrintedRanges": [{"start": "10", "end": "10"}, {"start": "12", "end": "12"}],
        "missingPrintedPages": ["11"],
        "acceptedForProduct": False,
        "acceptedAt": None,
    }
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="12", anomaly=None, status="pending_review", duplicate_of=None),
    ]
    result = finalize_inventory(
        records,
        _manifest(
            candidate_ranges=[{"start": 1, "end": 2}], coverage=coverage
        ),
    )
    assert "declared_gap" in result[1].anomalyFlags
    assert result[1].continuityBreakBefore is True
    assert result[1].canonicalStatus == "include"
    assert result[1].canonicalSequenceIndex == 2


def test_partial_mismatch_remains_gap() -> None:
    coverage = {
        "status": "partial_source",
        "statement": "Missing pages 11, 13",
        "observedPrintedRanges": [{"start": "10", "end": "10"}, {"start": "13", "end": "13"}],
        "missingPrintedPages": ["11"],
        "acceptedForProduct": False,
        "acceptedAt": None,
    }
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="13", anomaly=None, status="pending_review", duplicate_of=None),
    ]
    result = finalize_inventory(
        records,
        _manifest(
            candidate_ranges=[{"start": 1, "end": 2}], coverage=coverage
        ),
    )
    assert "gap" in result[1].anomalyFlags
    assert "declared_gap" not in result[1].anomalyFlags


def test_first_eligible_record_in_later_noncontiguous_range_gets_candidate_range_break() -> None:
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="11", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(5, label="12", anomaly=None, status="pending_review", duplicate_of=None),
    ]
    manifest = _manifest(candidate_ranges=[{"start": 1, "end": 2}, {"start": 5, "end": 5}])
    result = finalize_inventory(records, manifest)
    assert "candidate_range_break" in result[2].anomalyFlags
    assert result[2].continuityBreakBefore is True
    assert result[2].canonicalStatus == "include"
    assert result[2].canonicalSequenceIndex == 3


def test_candidate_range_break_does_not_require_a_printed_label() -> None:
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(5, label=None, anomaly="label_missing", status="pending_review", duplicate_of=None),
    ]
    result = finalize_inventory(
        records,
        _manifest(candidate_ranges=[{"start": 1, "end": 1}, {"start": 5, "end": 5}]),
    )
    assert "candidate_range_break" in result[1].anomalyFlags
    assert result[1].continuityBreakBefore is True


def test_declared_gap_matches_a_contiguous_slice_of_all_missing_pages() -> None:
    coverage = {
        "status": "partial_source",
        "statement": "The source has several missing spans.",
        "observedPrintedRanges": [{"start": "10", "end": "10"}, {"start": "13", "end": "13"}],
        "missingPrintedPages": ["1", "2", "11", "12", "20"],
        "acceptedForProduct": False,
        "acceptedAt": None,
    }
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="13", anomaly=None, status="pending_review", duplicate_of=None),
    ]
    result = finalize_inventory(
        records,
        _manifest(candidate_ranges=[{"start": 1, "end": 2}], coverage=coverage),
    )
    assert "declared_gap" in result[1].anomalyFlags
    assert "gap" not in result[1].anomalyFlags


@pytest.mark.parametrize(
    "anomaly",
    ["near_duplicate", "label_missing", "label_ambiguous"],
)
def test_unresolved_anomalies_keep_all_rows_pending_review(anomaly: str) -> None:
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="11", anomaly=anomaly, status="pending_review", duplicate_of=None),
    ]
    result = finalize_inventory(
        records, _manifest(candidate_ranges=[{"start": 1, "end": 2}])
    )
    assert all(record.canonicalStatus == "pending_review" for record in result)
    assert all(record.canonicalSequenceIndex is None for record in result)


def test_include_override_resolves_row() -> None:
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="10", anomaly=None, status="pending_review", duplicate_of=None),
    ]
    manifest = _manifest(
        candidate_ranges=[{"start": 1, "end": 2}],
        page_overrides=[
            {"pdfPage": 2, "side": "full", "normalizedPrintedLabel": "11", "canonicalStatus": "include", "reason": "Override"}
        ],
    )
    result = finalize_inventory(records, manifest)
    assert result[0].canonicalStatus == "include"
    assert result[0].canonicalSequenceIndex == 1
    assert result[1].canonicalStatus == "include"
    assert result[1].canonicalSequenceIndex == 2
    assert "repeat" in result[1].anomalyFlags


def test_explicit_canonical_sequence_positions_reorder_includes() -> None:
    records = [
        _pending_record(1, label="460", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="461", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(3, label="458", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(4, label="459", anomaly=None, status="pending_review", duplicate_of=None),
    ]
    page_overrides = [
        {
            "pdfPage": pdf_page,
            "side": "full",
            "normalizedPrintedLabel": None,
            "canonicalStatus": "include",
            "canonicalSequenceIndex": canonical_index,
            "reason": "Human-confirmed printed order",
        }
        for pdf_page, canonical_index in ((1, 3), (2, 4), (3, 1), (4, 2))
    ]
    coverage = {
        "status": "complete_source",
        "statement": "Observed printed pages 458 through 461.",
        "observedPrintedRanges": [{"start": "458", "end": "461"}],
        "missingPrintedPages": [],
        "acceptedForProduct": False,
        "acceptedAt": None,
    }

    result = finalize_inventory(
        records,
        _manifest(
            candidate_ranges=[{"start": 1, "end": 4}],
            page_overrides=page_overrides,
            coverage=coverage,
        ),
    )

    assert [record.pdfPage for record in result] == [1, 2, 3, 4]
    assert [record.canonicalSequenceIndex for record in result] == [3, 4, 1, 2]
    assert not any(record.continuityBreakBefore for record in result)
    canonical = sorted(result, key=lambda record: record.canonicalSequenceIndex or 0)
    assert [record.normalizedPrintedLabel for record in canonical] == [
        "458",
        "459",
        "460",
        "461",
    ]


def test_duplicate_explicit_canonical_sequence_positions_are_rejected() -> None:
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="11", anomaly=None, status="pending_review", duplicate_of=None),
    ]
    manifest = _manifest(
        candidate_ranges=[{"start": 1, "end": 2}],
        page_overrides=[
            {
                "pdfPage": pdf_page,
                "side": "full",
                "normalizedPrintedLabel": None,
                "canonicalStatus": "include",
                "canonicalSequenceIndex": 1,
                "reason": "Invalid duplicate explicit position",
            }
            for pdf_page in (1, 2)
        ],
    )

    with pytest.raises(PageInventoryError, match="canonicalSequenceIndex"):
        finalize_inventory(records, manifest)


def test_explicit_canonical_sequence_position_must_fit_include_count() -> None:
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="11", anomaly=None, status="pending_review", duplicate_of=None),
    ]
    manifest = _manifest(
        candidate_ranges=[{"start": 1, "end": 2}],
        page_overrides=[
            {
                "pdfPage": 2,
                "side": "full",
                "normalizedPrintedLabel": None,
                "canonicalStatus": "include",
                "canonicalSequenceIndex": 3,
                "reason": "Invalid explicit position",
            }
        ],
    )

    with pytest.raises(PageInventoryError, match="canonicalSequenceIndex"):
        finalize_inventory(records, manifest)


def test_non_includes_have_null_index_and_duplicate_of_targets_final_include() -> None:
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="11", anomaly=None, status="exclude_nonbody", duplicate_of=None),
        _pending_record(3, label="12", anomaly=None, status="exclude_duplicate", duplicate_of=(1, "full")),
    ]
    result = finalize_inventory(records, _manifest())
    assert result[1].canonicalSequenceIndex is None
    assert result[2].canonicalSequenceIndex is None
    assert result[2].duplicateOf is not None
    assert result[2].duplicateOf.pdfPage == 1


def _clean_finalized_records() -> list[PageInventoryRecord]:
    records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="11", anomaly=None, status="pending_review", duplicate_of=None),
    ]
    return finalize_inventory(
        records, _manifest(candidate_ranges=[{"start": 1, "end": 2}])
    )


def _complete_coverage(
    *, end: str = "11",
) -> dict[str, object]:
    return {
        "status": "complete_source",
        "statement": "Complete source for the reviewed range.",
        "observedPrintedRanges": [{"start": "10", "end": end}],
        "missingPrintedPages": [],
        "acceptedForProduct": False,
        "acceptedAt": None,
    }


def _verified_manifest(
    payload: bytes,
    *,
    coverage: dict[str, object] | None = None,
    page_overrides: list[dict[str, object]] | None = None,
    duplicate_decisions: list[dict[str, object]] | None = None,
    candidate_ranges: list[dict[str, int]] | None = None,
) -> MadozManifest:
    return _manifest(
        candidate_ranges=candidate_ranges or [{"start": 1, "end": 2}],
        coverage=coverage or _complete_coverage(),
        page_overrides=page_overrides,
        duplicate_decisions=duplicate_decisions,
        inventory_review_status="verified",
        expected_inventory_sha256=hashlib.sha256(payload).hexdigest(),
        inventory_verified_at="2026-09-03T12:00:00+02:00",
    )


def test_serialize_inventory_jsonl_is_canonical_and_hashed_with_final_lf() -> None:
    records = _clean_finalized_records()

    payload = serialize_inventory_jsonl(records)

    expected = b"".join(
        (
            json.dumps(
                record.model_dump(
                    mode="json",
                    by_alias=True,
                    exclude_none=False,
                ),
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            )
            + "\n"
        ).encode("utf-8")
        for record in records
    )
    assert payload == expected
    assert payload.endswith(b"\n")
    assert inventory_sha256(records) == hashlib.sha256(payload).hexdigest()


def test_load_verified_inventory_accepts_canonical_matching_payload() -> None:
    records = _clean_finalized_records()
    payload = serialize_inventory_jsonl(records)

    loaded = load_verified_inventory(payload, _verified_manifest(payload))

    assert [record.model_dump(mode="json") for record in loaded] == [
        record.model_dump(mode="json") for record in records
    ]


def test_load_verified_inventory_rejects_pending_manifest() -> None:
    payload = serialize_inventory_jsonl(_clean_finalized_records())
    pending = _manifest(
        candidate_ranges=[{"start": 1, "end": 2}],
        coverage=_complete_coverage(),
    )
    with pytest.raises(PageInventoryError, match="review.*verified"):
        load_verified_inventory(payload, pending)


def test_load_verified_inventory_rejects_wrong_hash() -> None:
    payload = serialize_inventory_jsonl(_clean_finalized_records())
    manifest = _manifest(
        candidate_ranges=[{"start": 1, "end": 2}],
        coverage=_complete_coverage(),
        inventory_review_status="verified",
        expected_inventory_sha256="f" * 64,
        inventory_verified_at="2026-09-03T12:00:00+02:00",
    )
    with pytest.raises(PageInventoryError, match="SHA-256"):
        load_verified_inventory(payload, manifest)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload.replace(b":", b": ", 1),
        lambda payload: payload[:-1],
    ],
)
def test_load_verified_inventory_rejects_noncanonical_bytes(mutate) -> None:
    canonical = serialize_inventory_jsonl(_clean_finalized_records())
    tampered = mutate(canonical)
    with pytest.raises(PageInventoryError, match="canonical"):
        load_verified_inventory(tampered, _verified_manifest(tampered))


def test_load_verified_inventory_rejects_invalid_record_after_hash() -> None:
    payload = b"{}\n"
    with pytest.raises(PageInventoryError, match="schemaVersion"):
        load_verified_inventory(payload, _verified_manifest(payload))


def test_inventory_limits_are_fail_closed() -> None:
    records = _clean_finalized_records()
    first_line = serialize_inventory_jsonl(records).splitlines(keepends=True)[0]

    with pytest.raises(PageInventoryError, match="2000"):
        serialize_inventory_jsonl([records[0]] * 2001)
    with pytest.raises(PageInventoryError, match="2000"):
        load_verified_inventory(
            first_line * 2001,
            _verified_manifest(first_line * 2001),
        )
    oversized = b"x" * (2 * 1024 * 1024 + 1)
    with pytest.raises(PageInventoryError, match="2 MiB"):
        load_verified_inventory(oversized, _verified_manifest(oversized))


def test_verified_inventory_rejects_pending_row_or_pair() -> None:
    pending_records = [
        _pending_record(1, label="10", anomaly=None, status="pending_review", duplicate_of=None),
        _pending_record(2, label="11", anomaly=None, status="pending_review", duplicate_of=None),
    ]
    pending_payload = serialize_inventory_jsonl(pending_records)
    with pytest.raises(PageInventoryError, match="pending"):
        load_verified_inventory(
            pending_payload,
            _verified_manifest(pending_payload),
        )

    records = _clean_finalized_records()
    with_pending_pair = [
        _revalidated(
            records[0],
            duplicateCandidates=[
                {
                    "pdfPage": 2,
                    "side": "full",
                    "reasons": ["dhash_le_5"],
                    "decision": "pending",
                    "canonical": None,
                    "decisionReason": None,
                }
            ],
            anomalyFlags=["near_duplicate"],
        ),
        records[1],
    ]
    pair_payload = serialize_inventory_jsonl(with_pending_pair)
    with pytest.raises(PageInventoryError, match="pending"):
        load_verified_inventory(pair_payload, _verified_manifest(pair_payload))


def test_verified_inventory_rejects_bad_indices_and_dangling_duplicate() -> None:
    records = _clean_finalized_records()
    bad_indices = [
        _revalidated(records[0], canonicalSequenceIndex=2),
        _revalidated(records[1], canonicalSequenceIndex=3),
    ]
    index_payload = serialize_inventory_jsonl(bad_indices)
    with pytest.raises(PageInventoryError, match="indices"):
        load_verified_inventory(index_payload, _verified_manifest(index_payload))

    dangling = [
        records[0],
        _revalidated(
            records[1],
            canonicalStatus="exclude_duplicate",
            duplicateOf={"pdfPage": 99, "side": "full"},
            canonicalSequenceIndex=None,
        ),
    ]
    dangling_payload = serialize_inventory_jsonl(dangling)
    with pytest.raises(PageInventoryError, match="duplicateOf"):
        load_verified_inventory(
            dangling_payload,
            _verified_manifest(dangling_payload),
        )


@pytest.mark.parametrize(
    "coverage",
    [
        _complete_coverage(end="12"),
        {
            "status": "partial_source",
            "statement": "Page 12 is declared absent.",
            "observedPrintedRanges": [{"start": "10", "end": "11"}],
            "missingPrintedPages": ["12"],
            "acceptedForProduct": False,
            "acceptedAt": None,
        },
    ],
)
def test_verified_inventory_rejects_coverage_mismatch(
    coverage: dict[str, object],
) -> None:
    payload = serialize_inventory_jsonl(_clean_finalized_records())
    with pytest.raises(PageInventoryError, match="coverage"):
        load_verified_inventory(
            payload,
            _verified_manifest(payload, coverage=coverage),
        )


def test_verified_inventory_rejects_unresolved_anomaly() -> None:
    records = _clean_finalized_records()
    unresolved = [
        _revalidated(records[0], anomalyFlags=["repeat"]),
        records[1],
    ]
    payload = serialize_inventory_jsonl(unresolved)
    with pytest.raises(PageInventoryError, match="unresolved"):
        load_verified_inventory(payload, _verified_manifest(payload))


def test_verified_confirmed_component_has_exactly_one_included_canonical() -> None:
    decisions = _chain_decisions()
    pending_manifest = _manifest(
        candidate_ranges=[{"start": 1, "end": 3}],
        duplicate_decisions=decisions,
    )
    resolved = apply_duplicate_decisions(_duplicate_chain(), pending_manifest)
    finalized = finalize_inventory(resolved, pending_manifest)
    finalized = [
        _revalidated(record, anomalyFlags=["label_missing"])
        if record.canonicalStatus == "exclude_duplicate"
        else record
        for record in finalized
    ]
    payload = serialize_inventory_jsonl(finalized)
    verified = _verified_manifest(
        payload,
        coverage=_unknown_coverage(),
        duplicate_decisions=decisions,
        candidate_ranges=[{"start": 1, "end": 3}],
    )
    assert len(load_verified_inventory(payload, verified)) == 3

    two_included = [
        finalized[0],
        _revalidated(
            finalized[1],
            canonicalStatus="include",
            duplicateOf=None,
            canonicalSequenceIndex=2,
        ),
        finalized[2],
    ]
    bad_payload = serialize_inventory_jsonl(two_included)
    bad_manifest = _verified_manifest(
        bad_payload,
        coverage=_unknown_coverage(),
        duplicate_decisions=decisions,
        candidate_ranges=[{"start": 1, "end": 3}],
    )
    with pytest.raises(PageInventoryError, match="confirmed component"):
        load_verified_inventory(bad_payload, bad_manifest)


def _unknown_coverage() -> dict[str, object]:
    return {
        "status": "unknown",
        "statement": None,
        "observedPrintedRanges": [],
        "missingPrintedPages": [],
        "acceptedForProduct": False,
        "acceptedAt": None,
    }


@pytest.mark.parametrize("excluded", [False, True])
def test_unknown_coverage_label_missing_requires_human_override(
    excluded: bool,
) -> None:
    records = _clean_finalized_records()
    missing = _revalidated(
        records[0],
        normalizedPrintedLabel=None,
        printedLabelBox=None,
        printedLabelSource="missing",
        anomalyFlags=["label_missing"],
        canonicalStatus="exclude_nonbody" if excluded else "include",
        canonicalSequenceIndex=None if excluded else 1,
        decisionReason="Human exclusion" if excluded else None,
    )
    remaining = _revalidated(
        records[1],
        canonicalSequenceIndex=1 if excluded else 2,
    )
    payload_records = [missing, remaining]
    payload = serialize_inventory_jsonl(payload_records)

    with pytest.raises(PageInventoryError, match="pageOverride"):
        load_verified_inventory(
            payload,
            _verified_manifest(payload, coverage=_unknown_coverage()),
        )

    override = {
        "pdfPage": 1,
        "side": "full",
        "normalizedPrintedLabel": None,
        "canonicalStatus": "exclude_nonbody" if excluded else "include",
        "reason": "Reviewed missing printed label",
    }
    loaded = load_verified_inventory(
        payload,
        _verified_manifest(
            payload,
            coverage=_unknown_coverage(),
            page_overrides=[override],
        ),
    )
    assert len(loaded) == 2
