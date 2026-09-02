from __future__ import annotations

from copy import deepcopy
import math

import pytest
from pydantic import ValidationError

from historical_corpus.identity import (
    canonical_json_bytes,
    compute_chunk_id,
    compute_line_id,
    compute_page_id,
)
from historical_corpus.ingest_models import (
    CanonicalizationSnapshot,
    CoverageMetadata,
    DuplicateCandidate,
    DuplicateDecisionSnapshot,
    ExtractedLineCandidate,
    InventoryPageRef,
    ModelLock,
    ModelLockEntry,
    ModelLockFile,
    ModelLockFingerprint,
    PageInventoryRecord,
    PageOverrideSnapshot,
    PrintedLabelCandidate,
    PublicationGateSnapshot,
    SourceLineInput,
    SourcePageInput,
    StagedPage,
)
from historical_corpus.models import NormalizedBox, PrintedRange


SHA_0 = "sha256:" + "0" * 64
SHA_1 = "sha256:" + "1" * 64
SHA_2 = "sha256:" + "2" * 64
SHA_3 = "sha256:" + "3" * 64


def _box() -> dict[str, float]:
    return {"x0": 0.123456789, "y0": 0.2, "x1": 0.876543219, "y1": 0.9}


def _line(**updates: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "lineId": SHA_2,
        "logicalPageNumber": 1,
        "lineOrder": 0,
        "originalText": "MÁLAGA: ciudad histórica.",
        "confidence": 0.95,
        "box": _box(),
        "orientationDegrees": None,
        "role": "body",
    }
    payload.update(updates)
    return payload


def _page(**updates: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "pageId": SHA_1,
        "documentId": "madoz-11",
        "logicalPageNumber": 1,
        "sourcePdfPageNumber": 39,
        "leafSide": "full",
        "continuityBreakBefore": False,
        "cropBox": _box(),
        "printedPageLabel": "32",
        "widthPx": 2550,
        "heightPx": 3300,
        "renderDpi": 300,
        "rasterizationPolicy": "pymupdf-page-render-v1",
        "rotationDegrees": 0,
        "imageSha256": SHA_0,
        "contentClass": "normal",
        "foregroundRatio": 0.31,
        "textSource": "ppocrv6",
        "ocrEngine": "transformers",
        "ocrEngineVersion": "3.7.0",
        "ocrDetectionModel": "PP-OCRv6_medium_det",
        "ocrRecognitionModel": "PP-OCRv6_medium_rec",
        "meanConfidence": 0.95,
        "lowConfidenceRatio": 0.0,
        "qualityScore": 0.93,
        "qualityFlags": [],
        "originalText": "MÁLAGA: ciudad histórica.",
        "lines": [_line()],
    }
    payload.update(updates)
    return payload


def _inventory(**updates: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "schemaVersion": 1,
        "pdfPage": 39,
        "side": "full",
        "mediaBox": [0.0, 0.0, 612.0, 792.0],
        "pdfRotationDegrees": 0,
        "rasterWidthPx": 5100,
        "rasterHeightPx": 6600,
        "rasterBitsPerComponent": 1,
        "rasterFilter": "JBIG2Decode",
        "declaredDpiX": 600.0,
        "declaredDpiY": 600.0,
        "printedLabelCandidates": [{"text": "32.", "box": _box()}],
        "normalizedPrintedLabel": "32",
        "printedLabelBox": _box(),
        "printedLabelSource": "embedded_ocr_heuristic",
        "sourceImageSha256": SHA_0,
        "visualDhash64": "0123456789abcdef",
        "embeddedTextSha256": SHA_1,
        "textSimhash64": "fedcba9876543210",
        "duplicateCandidates": [],
        "anomalyFlags": [],
        "canonicalStatus": "include",
        "duplicateOf": None,
        "canonicalSequenceIndex": 1,
        "continuityBreakBefore": False,
        "decisionReason": None,
    }
    payload.update(updates)
    return payload


def _lock(**updates: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "schemaVersion": 1,
        "paddleOcrVersion": "3.7.0",
        "paddleXVersion": "3.7.2",
        "transformersVersion": "4.56.2",
        "engine": "transformers",
        "models": [
            {
                "name": "PP-OCRv6_medium_det",
                "cacheRelativePath": "official_models/PP-OCRv6_medium_det",
                "files": [
                    {
                        "relativePath": "config.json",
                        "sizeBytes": 123,
                        "sha256": SHA_0,
                    },
                    {
                        "relativePath": "model.safetensors",
                        "sizeBytes": 456,
                        "sha256": SHA_1,
                    },
                ],
            },
            {
                "name": "PP-OCRv6_medium_rec",
                "cacheRelativePath": "official_models/PP-OCRv6_medium_rec",
                "files": [
                    {
                        "relativePath": "model.safetensors",
                        "sizeBytes": 789,
                        "sha256": SHA_2,
                    }
                ],
            },
        ],
    }
    payload.update(updates)
    return payload


def test_canonical_json_and_identity_vectors_are_exact() -> None:
    assert canonical_json_bytes({"z": "á", "a": 1}) == b'{"a":1,"z":"\xc3\xa1"}'

    box = NormalizedBox.model_validate(_box())
    page_id = compute_page_id(
        document_id="madoz-11",
        source_pdf_page_number=39,
        leaf_side="full",
        crop_box=box,
        rotation_degrees=0,
        image_sha256=SHA_1,
    )
    assert page_id == "sha256:e6dca8e595e030ef635194e1d64559e17847beeb6966617d67f402f8888e3a17"
    assert box.x0 == 0.123456789
    assert box.x1 == 0.876543219

    line_id = compute_line_id(
        page_id=page_id,
        line_order=7,
        original_text="MÁLAGA: ciudad histórica.",
        box=box,
    )
    assert line_id == "sha256:e0c21ceed35b1ad52b01cbb86e6c3e831979482677833fc7f8345a42ad9e0d12"

    assert compute_chunk_id(
        "madoz-11",
        32,
        33,
        ["Diccionario Madoz", "Tomo XI", "MÁLAGA"],
        "MÁLAGA: ciudad histórica.",
    ) == "sha256:42a5750007025533db4b8124580e5f99e1b99593d8dae3d8c1989e3bdea4ffbd"


def test_coverage_models_reuse_public_range_and_enforce_gate_rules() -> None:
    coverage = CoverageMetadata(
        status="partial_source",
        statement="Faltan dos páginas impresas.",
        observedPrintedRanges=[PrintedRange(start="32", end="61")],
        missingPrintedPages=["62", "63"],
        acceptedForProduct=True,
        acceptedAt="2026-09-02T20:00:00+02:00",
    )
    assert type(coverage.observedPrintedRanges[0]) is PrintedRange
    PublicationGateSnapshot(sourceIsExactRecord=True, coverage=coverage)

    invalid = [
        {**coverage.model_dump(), "statement": None},
        {**coverage.model_dump(), "missingPrintedPages": ["40"]},
        {**coverage.model_dump(), "acceptedAt": "2026-09-02T20:00:00"},
        {**coverage.model_dump(), "observedPrintedRanges": [{"start": "40", "end": "70"}, {"start": "60", "end": "80"}]},
        {**coverage.model_dump(), "missingPrintedPages": ["63", "62"]},
        {**coverage.model_dump(), "missingPrintedPages": ["62", "62"]},
    ]
    for payload in invalid:
        with pytest.raises(ValidationError):
            CoverageMetadata.model_validate(payload)

    with pytest.raises(ValidationError):
        CoverageMetadata(
            status="unknown",
            observedPrintedRanges=[],
            missingPrintedPages=[],
            acceptedForProduct=True,
            acceptedAt="2026-09-02T20:00:00Z",
        )
    with pytest.raises(ValidationError):
        PublicationGateSnapshot.model_validate(
            {"sourceIsExactRecord": True, "coverage": coverage, "extra": "forbidden"}
        )


def test_extracted_lines_and_source_page_are_strict_and_finite() -> None:
    ExtractedLineCandidate(
        originalText="MÁLAGA",
        confidence=0.9,
        polygon=[[1.0, 2.0], [8.0, 2.0], [8.0, 4.0], [1.0, 4.0]],
        correction180=0,
    )
    page = SourcePageInput.model_validate(_page())
    assert page.lines[0].logicalPageNumber == page.logicalPageNumber

    for polygon in (
        [[1.0, 2.0]] * 3,
        [[1.0, 2.0], [8.0, 2.0], [8.0, 4.0], [-1.0, 4.0]],
        [[1.0, 2.0], [8.0, 2.0], [8.0, 4.0], [math.inf, 4.0]],
    ):
        with pytest.raises(ValidationError):
            ExtractedLineCandidate(
                originalText="MÁLAGA", confidence=0.9, polygon=polygon, correction180=0
            )

    invalid_pages = [
        _page(meanConfidence=math.nan),
        _page(qualityFlags=["table_heavy", "blank"]),
        _page(qualityFlags=["blank", "blank"]),
        _page(lines=[_line(lineOrder=1), _line(lineOrder=0, lineId=SHA_3)]),
        _page(lines=[_line(logicalPageNumber=2)]),
        _page(textSource="embedded"),
        _page(extra="forbidden"),
    ]
    for payload in invalid_pages:
        with pytest.raises(ValidationError):
            SourcePageInput.model_validate(payload)

    with pytest.raises(ValidationError):
        SourceLineInput.model_validate(_line(lineId="0" * 64))


def test_inventory_record_enforces_order_and_status_invariants() -> None:
    record = PageInventoryRecord.model_validate(_inventory())
    assert isinstance(record.printedLabelCandidates[0], PrintedLabelCandidate)

    duplicate = {
        "pdfPage": 40,
        "side": "full",
        "reasons": ["dhash_le_5", "same_label"],
        "decision": "pending",
        "canonical": None,
        "decisionReason": None,
    }
    assert isinstance(DuplicateCandidate.model_validate(duplicate), DuplicateCandidate)

    invalid_records = [
        _inventory(mediaBox=[0.0, 0.0, 0.0, 792.0]),
        _inventory(anomalyFlags=["repeat", "gap"]),
        _inventory(anomalyFlags=["gap", "gap"]),
        _inventory(duplicateCandidates=[duplicate, duplicate]),
        _inventory(canonicalStatus="include", canonicalSequenceIndex=None),
        _inventory(canonicalStatus="include", duplicateOf={"pdfPage": 40, "side": "full"}),
        _inventory(canonicalStatus="exclude_duplicate", duplicateOf=None, canonicalSequenceIndex=None),
        _inventory(canonicalStatus="exclude_nonbody", canonicalSequenceIndex=None, decisionReason=None),
        _inventory(canonicalStatus="pending_review", canonicalSequenceIndex=1),
    ]
    for payload in invalid_records:
        with pytest.raises(ValidationError):
            PageInventoryRecord.model_validate(payload)


def test_canonicalization_snapshots_enforce_human_decisions() -> None:
    first = {"pdfPage": 39, "side": "full"}
    second = {"pdfPage": 40, "side": "full"}
    decision = {
        "first": first,
        "second": second,
        "decision": "confirmed_duplicate",
        "canonical": first,
        "reason": "Misma hoja reescaneada.",
    }
    override = {
        "pdfPage": 41,
        "side": "full",
        "normalizedPrintedLabel": "34",
        "canonicalStatus": None,
        "reason": "Lectura visual.",
    }
    snapshot = CanonicalizationSnapshot(
        defaultStatus="include",
        defaultOrder="source_order",
        duplicateDecisions=[decision],
        pageOverrides=[override],
    )
    assert isinstance(snapshot.duplicateDecisions[0].first, InventoryPageRef)

    invalid_decisions = [
        {**decision, "first": second, "second": first},
        {**decision, "decision": "false_positive", "canonical": first},
        {**decision, "decision": "confirmed_duplicate", "canonical": None},
        {**decision, "reason": ""},
    ]
    for payload in invalid_decisions:
        with pytest.raises(ValidationError):
            DuplicateDecisionSnapshot.model_validate(payload)

    with pytest.raises(ValidationError):
        PageOverrideSnapshot(
            pdfPage=41,
            side="full",
            normalizedPrintedLabel=None,
            canonicalStatus=None,
            reason="Sin decisión.",
        )
    with pytest.raises(ValidationError):
        CanonicalizationSnapshot(
            defaultStatus="include",
            defaultOrder="source_order",
            duplicateDecisions=[decision, decision],
            pageOverrides=[],
        )


def test_staged_page_and_model_lock_are_strict_and_relocatable() -> None:
    StagedPage(
        schemaVersion=1,
        canonicalPdfSha256=SHA_0,
        pageInventorySha256=SHA_1,
        processingFingerprint=SHA_2,
        pageArtifactHash=SHA_3,
        page=SourcePageInput.model_validate(_page()),
    )

    lock = ModelLock.model_validate(_lock())
    assert isinstance(lock.models[0], ModelLockEntry)
    assert isinstance(lock.models[0].files[0], ModelLockFile)

    projection = ModelLockFingerprint.from_model_lock(lock)
    dumped = projection.model_dump(mode="json")
    assert dumped["paddleOcrVersion"] == "3.7.0"
    assert "cacheRelativePath" not in dumped["models"][0]

    relocated = deepcopy(_lock())
    relocated["models"][0]["cacheRelativePath"] = "relocated/det"  # type: ignore[index]
    assert ModelLockFingerprint.from_model_lock(ModelLock.model_validate(relocated)) == projection
    with pytest.raises(ValidationError):
        projection.paddleOcrVersion = "changed"  # type: ignore[misc]

    invalid_locks: list[dict[str, object]] = []
    for bad_path in ("../model.bin", "/model.bin", "dir\\model.bin", "dir%2Fmodel.bin", "dir//model.bin"):
        payload = deepcopy(_lock())
        payload["models"][0]["files"][0]["relativePath"] = bad_path  # type: ignore[index]
        invalid_locks.append(payload)
    unsorted_files = deepcopy(_lock())
    unsorted_files["models"][0]["files"].reverse()  # type: ignore[index]
    invalid_locks.append(unsorted_files)
    duplicate_models = deepcopy(_lock())
    duplicate_models["models"].append(deepcopy(duplicate_models["models"][0]))  # type: ignore[union-attr,index]
    invalid_locks.append(duplicate_models)

    for payload in invalid_locks:
        with pytest.raises(ValidationError):
            ModelLock.model_validate(payload)


def test_model_lock_fingerprint_direct_construction_enforces_ordering_and_uniqueness() -> None:
    lock = ModelLock.model_validate(_lock())
    projection = ModelLockFingerprint.from_model_lock(lock)
    base = projection.model_dump(mode="json")

    # Valid direct construction from the projection dump.
    assert ModelLockFingerprint.model_validate(base) == projection

    # Reversed files within one fingerprint model entry must fail.
    reversed_files = deepcopy(base)
    reversed_files["models"][0]["files"].reverse()  # type: ignore[index]
    with pytest.raises(ValidationError):
        ModelLockFingerprint.model_validate(reversed_files)

    # Duplicated fingerprint model entries must fail.
    duplicated = deepcopy(base)
    duplicated["models"].append(deepcopy(duplicated["models"][0]))  # type: ignore[union-attr,index]
    with pytest.raises(ValidationError):
        ModelLockFingerprint.model_validate(duplicated)

    # Reversed fingerprint model entries must fail.
    reversed_entries = deepcopy(base)
    reversed_entries["models"].reverse()  # type: ignore[index]
    with pytest.raises(ValidationError):
        ModelLockFingerprint.model_validate(reversed_entries)
