from __future__ import annotations

from copy import deepcopy
import hashlib
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
    CandidatePdfPageRange,
    CanonicalizationSnapshot,
    ChunkingFingerprint,
    CoverageMetadata,
    DuplicateCandidate,
    DuplicateDecisionSnapshot,
    ExtractedLineCandidate,
    FingerprintPayload,
    FingerprintSelection,
    FingerprintSource,
    InventoryPageRef,
    LeafGeometryFingerprint,
    LeafOverrideFingerprint,
    ModelLock,
    ModelLockEntry,
    ModelLockFile,
    ModelLockFingerprint,
    OcrEvaluationPageRef,
    OcrEvaluationSample,
    OcrFingerprint,
    PageInventoryRecord,
    PageOverrideSnapshot,
    PolicyFingerprint,
    PreparedChunkInput,
    PreparedDocument,
    PreparationReport,
    PrintedLabelCandidate,
    PublicationGateSnapshot,
    QualityFingerprint,
    RenderFingerprint,
    SourceLineInput,
    SourcePageInput,
    SoftwareVersions,
    StagedPage,
    TableRegionFingerprint,
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
        _page(extra="forbidden"),
    ]
    for payload in invalid_pages:
        with pytest.raises(ValidationError):
            SourcePageInput.model_validate(payload)

    with pytest.raises(ValidationError):
        SourceLineInput.model_validate(_line(lineId="0" * 64))


def test_source_page_embedded_provenance_is_strict() -> None:
    embedded_page = _page(
        textSource="embedded",
        ocrEngine="pymupdf",
        ocrEngineVersion="1.28.2",
        ocrDetectionModel="pdf-text-layer",
        ocrRecognitionModel="pdf-text-layer",
    )
    page = SourcePageInput.model_validate(embedded_page)
    assert page.textSource == "embedded"
    assert page.ocrEngine == "pymupdf"
    assert page.ocrEngineVersion == "1.28.2"
    assert page.ocrDetectionModel == "pdf-text-layer"
    assert page.ocrRecognitionModel == "pdf-text-layer"

    crossed_embedded = _page(
        textSource="embedded",
        ocrEngine="transformers",
        ocrEngineVersion="3.7.0",
        ocrDetectionModel="PP-OCRv6_medium_det",
        ocrRecognitionModel="PP-OCRv6_medium_rec",
    )
    with pytest.raises(ValidationError):
        SourcePageInput.model_validate(crossed_embedded)

    crossed_ppocrv6 = _page(
        textSource="ppocrv6",
        ocrEngine="pymupdf",
        ocrEngineVersion="1.28.2",
        ocrDetectionModel="pdf-text-layer",
        ocrRecognitionModel="pdf-text-layer",
    )
    with pytest.raises(ValidationError):
        SourcePageInput.model_validate(crossed_ppocrv6)


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


def _fingerprint() -> FingerprintPayload:
    return FingerprintPayload.model_validate(
        {
            "fingerprintSchemaVersion": 1,
            "manifestSchemaVersion": 1,
            "source": {"canonicalPdfSha256": SHA_0},
            "selection": {
                "candidatePdfPageRanges": [{"start": 1, "end": 1}],
                "pageInventorySha256": SHA_1,
                "splitSpreads": False,
                "gutterRatio": 0.5,
                "innerGutterTrimRatio": 0.005,
                "canonicalization": {
                    "defaultStatus": "include",
                    "defaultOrder": "source_order",
                    "duplicateDecisions": [],
                    "pageOverrides": [],
                },
                "leafOverrides": [],
                "leafGeometry": [
                    {
                        "pdfPage": 1,
                        "side": "full",
                        "cropBox": {"x0": 0.0, "y0": 0.0, "x1": 1.0, "y1": 1.0},
                        "rotationDegrees": 0,
                        "widthPx": 100,
                        "heightPx": 200,
                    }
                ],
            },
            "software": {
                "pymupdf": "1.28.2",
                "paddleocr": "3.7.0",
                "paddlex": "3.7.2",
                "transformers": "5.16.1",
                "torch": "2.13.0",
                "numpy": "2.3.5",
            },
            "render": {"dpi": 300, "rasterizationPolicy": "pymupdf-page-render-v1"},
            "ocr": {
                "textMode": "ocr",
                "engine": "transformers",
                "device": "cpu",
                "detectionModel": "PP-OCRv6_medium_det",
                "recognitionModel": "PP-OCRv6_medium_rec",
                "language": "es",
                "documentOrientationClassification": False,
                "documentUnwarping": False,
                "textLineOrientation": True,
            },
            "modelLock": {
                "schemaVersion": 1,
                "paddleOcrVersion": "3.7.0",
                "paddleXVersion": "3.7.2",
                "transformersVersion": "5.16.1",
                "engine": "transformers",
                "models": [
                    {
                        "name": "PP-OCRv6_medium_det",
                        "files": [{"relativePath": "model.json", "sizeBytes": 1, "sha256": SHA_2}],
                    },
                    {
                        "name": "PP-OCRv6_medium_rec",
                        "files": [{"relativePath": "model.json", "sizeBytes": 1, "sha256": SHA_3}],
                    },
                ],
            },
            "quality": {"lowConfidenceThreshold": 0.6},
            "policies": {
                "layoutPolicy": "madoz-two-column-v1",
                "entryPolicy": "madoz-entry-v1",
            },
            "chunking": {"maxChunkChars": 1500, "overlapLines": 2},
        }
    )


def _prepared_metadata(processing_fingerprint: str, inventory_sha256: str) -> dict[str, object]:
    return {
        "documentId": "madoz-11",
        "sourceUrl": "https://books.google.es/books?id=eboNAAAAIAAJ",
        "title": "Diccionario geográfico-estadístico-histórico",
        "author": "Pascual Madoz",
        "edition": "Tomo XI",
        "publicationYear": 1848,
        "language": "es",
        "countryCode": "ES",
        "sourceClass": "primary_historical",
        "contentHash": SHA_0,
        "rights": {
            "status": "pending_intended_use_review",
            "uri": "https://books.google.es/books?id=eboNAAAAIAAJ",
            "verifiedAt": "2026-09-02T20:00:00+02:00",
            "isExplicitlyReusable": False,
        },
        "workId": "madoz-diccionario-1845-1850",
        "volumeNumber": 11,
        "repositoryName": "Google Books / Stanford University Libraries",
        "historicalPeriod": "1848",
        "temporalScope": "España, siglo XIX",
        "attribution": "Digitalizado por Google",
        "sourceIsExactRecord": True,
        "canonicalPdfSha256": SHA_0,
        "processingFingerprint": processing_fingerprint,
        "pageInventorySha256": inventory_sha256,
        "coverageStatus": "partial_source",
        "coverageStatement": "Faltan dos páginas impresas.",
        "observedPrintedRanges": [{"start": "32", "end": "61"}],
        "missingPrintedPages": ["62", "63"],
        "coverageAcceptedForProduct": False,
        "coverageAcceptedAt": None,
    }


def _publication_gate() -> dict[str, object]:
    return {
        "sourceIsExactRecord": True,
        "coverage": {
            "status": "partial_source",
            "statement": "Faltan dos páginas impresas.",
            "observedPrintedRanges": [{"start": "32", "end": "61"}],
            "missingPrintedPages": ["62", "63"],
            "acceptedForProduct": False,
            "acceptedAt": None,
        },
    }


def _prepared_chunk(line_id: str = SHA_2) -> dict[str, object]:
    payload: dict[str, object] = {
        "originalText": "MÁLAGA: ciudad histórica.",
        "correctedText": None,
        "pageStart": 1,
        "pageEnd": 1,
        "sectionPath": ["Diccionario Madoz", "Tomo XI", "MÁLAGA"],
        "cityQids": [],
        "entityQids": [],
        "historicalPeriod": "1848",
        "ocrConfidence": 0.95,
        "entryTitle": "MÁLAGA",
        "chunkId": SHA_3,
        "lineIds": [line_id],
    }
    payload["chunkId"] = compute_chunk_id(
        "madoz-11",
        1,
        1,
        payload["sectionPath"],  # type: ignore[arg-type]
        payload["originalText"],  # type: ignore[arg-type]
    )
    return payload


def _canonical_hash(payload: object) -> str:
    return "sha256:" + hashlib.sha256(canonical_json_bytes(payload)).hexdigest()


def _hash_without(payload: dict[str, object], excluded: set[str]) -> str:
    projection = deepcopy(payload)
    for field in excluded:
        projection.pop(field)
    return _canonical_hash(projection)


def _prepared_document() -> dict[str, object]:
    page_data = _page()
    crop_box = NormalizedBox.model_validate(page_data["cropBox"])
    page_id = compute_page_id(
        document_id=page_data["documentId"],  # type: ignore[arg-type]
        source_pdf_page_number=page_data["sourcePdfPageNumber"],  # type: ignore[arg-type]
        leaf_side=page_data["leafSide"],  # type: ignore[arg-type]
        crop_box=crop_box,
        rotation_degrees=page_data["rotationDegrees"],  # type: ignore[arg-type]
        image_sha256=page_data["imageSha256"],  # type: ignore[arg-type]
    )
    line_data = _line()
    line_data["lineId"] = compute_line_id(
        page_id=page_id,
        line_order=line_data["lineOrder"],  # type: ignore[arg-type]
        original_text=line_data["originalText"],  # type: ignore[arg-type]
        box=NormalizedBox.model_validate(line_data["box"]),
    )
    page_data["pageId"] = page_id
    page_data["lines"] = [line_data]
    page_data["originalText"] = line_data["originalText"]
    page = SourcePageInput.model_validate(page_data)
    page_json = page.model_dump(mode="json", by_alias=True, exclude_none=False)
    page_artifact_hash = _canonical_hash(page_json)

    inventory = PageInventoryRecord.model_validate(_inventory())
    inventory_json = inventory.model_dump(mode="json", by_alias=True, exclude_none=False)
    inventory_sha256 = "sha256:" + hashlib.sha256(
        canonical_json_bytes(inventory_json) + b"\n"
    ).hexdigest()

    processing_data = _fingerprint().model_dump(mode="json", by_alias=True, exclude_none=False)
    selection = processing_data["selection"]
    selection["candidatePdfPageRanges"] = [{"start": 39, "end": 39}]
    selection["pageInventorySha256"] = inventory_sha256
    selection["leafGeometry"] = [
        {
            "pdfPage": 39,
            "side": "full",
            "cropBox": page_json["cropBox"],
            "rotationDegrees": page_json["rotationDegrees"],
            "widthPx": page_json["widthPx"],
            "heightPx": page_json["heightPx"],
        }
    ]
    processing = FingerprintPayload.model_validate(processing_data)
    processing_hash = processing.fingerprint()

    document_id = "madoz-11"
    document_storage_key = hashlib.sha256(document_id.encode("utf-8")).hexdigest()
    payload: dict[str, object] = {
        "schemaVersion": 1,
        "preparedDocumentHash": SHA_3,
        "metadata": _prepared_metadata(processing_hash, inventory_sha256),
        "publicationGate": _publication_gate(),
        "chunks": [_prepared_chunk(line_data["lineId"])],
        "pages": [page_json],
        "pageArtifactHashes": [page_artifact_hash],
        "pageInventorySha256": inventory_sha256,
        "inventoryVerifiedAt": "2026-09-02T20:00:00+02:00",
        "inventoryRecords": [inventory_json],
        "canonicalization": {
            "defaultStatus": "include",
            "defaultOrder": "source_order",
            "duplicateDecisions": [],
            "pageOverrides": [],
        },
        "canonicalPdfRelativePath": f"raw/{document_storage_key}/{'0' * 64}.pdf",
        "processing": processing.model_dump(mode="json", by_alias=True, exclude_none=False),
        "processingFingerprint": processing_hash,
        "preparedAt": "2026-09-02T20:00:00+02:00",
    }
    payload["preparedDocumentHash"] = _hash_without(
        payload, {"preparedDocumentHash", "canonicalPdfRelativePath", "preparedAt"}
    )
    return payload


def _rehash_prepared(payload: dict[str, object]) -> None:
    payload["preparedDocumentHash"] = _hash_without(
        payload, {"preparedDocumentHash", "canonicalPdfRelativePath", "preparedAt"}
    )


def _rehash_sample(payload: dict[str, object]) -> None:
    payload["sampleHash"] = _hash_without(payload, {"sampleHash", "createdAt"})


def _rehash_first_page_and_prepared(payload: dict[str, object]) -> None:
    page_json = payload["pages"][0]  # type: ignore[index]
    payload["pageArtifactHashes"][0] = _canonical_hash(page_json)  # type: ignore[index]
    _rehash_prepared(payload)


def _evaluation_sample() -> dict[str, object]:
    prepared = _prepared_document()
    payload: dict[str, object] = {
        "schemaVersion": 1,
        "sampleHash": SHA_3,
        "publishable": False,
        "metadata": prepared["metadata"],
        "canonicalPdfSha256": SHA_0,
        "pageInventorySha256": prepared["pageInventorySha256"],
        "inventoryVerifiedAt": prepared["inventoryVerifiedAt"],
        "processing": prepared["processing"],
        "processingFingerprint": prepared["processingFingerprint"],
        "canonicalization": prepared["canonicalization"],
        "selectedPages": [{"pdfPage": 39, "side": "full", "logicalPageNumber": 1}],
        "selectedInventoryRecords": prepared["inventoryRecords"],
        "pages": prepared["pages"],
        "pageArtifactHashes": prepared["pageArtifactHashes"],
        "chunks": prepared["chunks"],
        "createdAt": "2026-09-02T20:00:00+02:00",
    }
    payload["sampleHash"] = _hash_without(payload, {"sampleHash", "createdAt"})
    return payload


def test_fingerprint_payload_is_exact_and_frozen() -> None:
    payload = _fingerprint()
    assert payload.fingerprint() == "sha256:21d527034ae1158ab887870c0a57236edbb3a3331bfbe982eccc0e34d7d70c75"

    extra = deepcopy(payload.model_dump(mode="json"))
    extra["extra"] = "forbidden"
    with pytest.raises(ValidationError):
        FingerprintPayload.model_validate(extra)

    with pytest.raises(ValidationError):
        payload.source.canonicalPdfSha256 = SHA_1  # type: ignore[misc]

    assert isinstance(payload.selection.candidatePdfPageRanges[0], CandidatePdfPageRange)
    assert isinstance(payload.selection, FingerprintSelection)
    assert isinstance(payload.source, FingerprintSource)
    assert isinstance(payload.selection.leafGeometry[0], LeafGeometryFingerprint)
    assert isinstance(payload.software, SoftwareVersions)
    assert isinstance(payload.render, RenderFingerprint)
    assert isinstance(payload.ocr, OcrFingerprint)
    assert isinstance(payload.quality, QualityFingerprint)
    assert isinstance(payload.policies, PolicyFingerprint)
    assert isinstance(payload.chunking, ChunkingFingerprint)

    bad_range = deepcopy(payload.model_dump(mode="json"))
    bad_range["selection"]["candidatePdfPageRanges"] = [  # type: ignore[index]
        {"start": 2, "end": 3},
        {"start": 3, "end": 4},
    ]
    with pytest.raises(ValidationError):
        FingerprintPayload.model_validate(bad_range)

    assert TableRegionFingerprint is not None
    assert LeafOverrideFingerprint is not None


def test_prepared_chunk_input_requires_unique_ordered_line_ids() -> None:
    chunk = PreparedChunkInput.model_validate(_prepared_chunk())
    assert chunk.lineIds == [SHA_2]

    with pytest.raises(ValidationError):
        PreparedChunkInput.model_validate({**_prepared_chunk(), "lineIds": [SHA_2, SHA_2]})
    with pytest.raises(ValidationError):
        PreparedChunkInput.model_validate({**_prepared_chunk(), "lineIds": []})
    with pytest.raises(ValidationError):
        PreparedChunkInput.model_validate({**_prepared_chunk(), "lineIds": [SHA_1] * 513})
    with pytest.raises(ValidationError):
        payload = _prepared_chunk()
        payload.pop("entryTitle")
        PreparedChunkInput.model_validate(payload)


def test_prepared_document_shape_is_valid() -> None:
    payload = _prepared_document()
    doc = PreparedDocument.model_validate(payload)
    assert doc.pages[0].pageId == payload["pages"][0]["pageId"]  # type: ignore[index]
    assert doc.inventoryRecords[0].pdfPage == 39
    assert doc.model_dump_json() == PreparedDocument.model_validate_json(doc.model_dump_json()).model_dump_json()

    with pytest.raises(ValidationError):
        PreparedDocument.model_validate({**doc.model_dump(mode="json"), "extra": "forbidden"})


def test_ocr_evaluation_sample_publishable_false_shape() -> None:
    sample = OcrEvaluationSample.model_validate(_evaluation_sample())
    assert sample.publishable is False
    assert isinstance(sample.selectedPages[0], OcrEvaluationPageRef)

    with pytest.raises(ValidationError):
        OcrEvaluationSample.model_validate({**sample.model_dump(mode="json"), "extra": "forbidden"})


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("sampleHash",), SHA_0),
        (("metadata", "canonicalPdfSha256"), SHA_1),
        (("metadata", "processingFingerprint"), SHA_2),
        (("canonicalPdfSha256",), SHA_1),
        (("pageInventorySha256",), SHA_2),
        (("processingFingerprint",), SHA_2),
        (("processing", "source", "canonicalPdfSha256"), SHA_1),
        (
            ("processing", "selection", "leafOverrides"),
            [
                {
                    "pdfPage": 39,
                    "side": "full",
                    "contentClass": "table",
                    "rotationDegrees": 0,
                    "tableRegions": [],
                }
            ],
        ),
        (
            ("canonicalization", "pageOverrides"),
            [
                {
                    "pdfPage": 39,
                    "side": "full",
                    "normalizedPrintedLabel": "32",
                    "canonicalStatus": None,
                    "reason": "Lectura visual.",
                }
            ],
        ),
        (("selectedPages", 0, "pdfPage"), 40),
        (("selectedInventoryRecords", 0, "pdfPage"), 40),
        (("pages", 0, "pageId"), SHA_0),
        (("pages", 0, "lines", 0, "lineId"), SHA_0),
        (("pages", 0, "ocrEngineVersion"), "9.9.9"),
        (("pageArtifactHashes", 0), SHA_0),
        (("chunks", 0, "chunkId"), SHA_0),
        (("chunks", 0, "lineIds"), [SHA_1]),
    ],
)
def test_ocr_evaluation_sample_deep_integrity_mutations_are_rejected(
    path: tuple[str | int, ...], value: object
) -> None:
    payload = _evaluation_sample()
    target: object = payload
    for key in path[:-1]:
        target = target[key]  # type: ignore[index]
    target[path[-1]] = value  # type: ignore[index]

    if path[:2] == ("processing", "source") or path[:2] == ("processing", "selection"):
        processing_hash = FingerprintPayload.model_validate(payload["processing"]).fingerprint()
        payload["processingFingerprint"] = processing_hash
        payload["metadata"]["processingFingerprint"] = processing_hash  # type: ignore[index]

    if path[0] == "pages":
        page_json = payload["pages"][0]  # type: ignore[index]
        payload["pageArtifactHashes"][0] = _canonical_hash(page_json)  # type: ignore[index]

    if path[0] != "sampleHash":
        _rehash_sample(payload)
    with pytest.raises(ValidationError):
        OcrEvaluationSample.model_validate(payload)


def test_ocr_evaluation_sample_created_at_does_not_change_hash() -> None:
    payload = _evaluation_sample()
    original_hash = payload["sampleHash"]
    payload["createdAt"] = "2026-09-03T10:00:00+02:00"
    _rehash_sample(payload)
    assert payload["sampleHash"] == original_hash
    OcrEvaluationSample.model_validate(payload)


def test_ocr_evaluation_sample_and_prepared_document_reject_each_other() -> None:
    sample_payload = _evaluation_sample()
    prepared_payload = _prepared_document()
    with pytest.raises(ValidationError):
        PreparedDocument.model_validate(sample_payload)
    with pytest.raises(ValidationError):
        OcrEvaluationSample.model_validate(prepared_payload)


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("publicationGate", "sourceIsExactRecord"), False),
        (("publicationGate", "coverage", "statement"), "Faltan tres páginas impresas."),
        (("metadata", "contentHash"), SHA_1),
        (("metadata", "canonicalPdfSha256"), SHA_1),
        (("metadata", "pageInventorySha256"), SHA_2),
        (("metadata", "processingFingerprint"), SHA_2),
        (("processingFingerprint",), SHA_2),
        (("processing", "source", "canonicalPdfSha256"), SHA_1),
        (("processing", "selection", "pageInventorySha256"), SHA_2),
        (
            ("canonicalization", "pageOverrides"),
            [
                {
                    "pdfPage": 39,
                    "side": "full",
                    "normalizedPrintedLabel": "32",
                    "canonicalStatus": None,
                    "reason": "Lectura visual.",
                }
            ],
        ),
        (("inventoryRecords", 0, "pdfPage"), 40),
        (
            ("canonicalPdfRelativePath",),
            f"raw/{hashlib.sha256(b'madoz-11').hexdigest()}/{'1' * 64}.pdf",
        ),
    ],
)
def test_prepared_document_provenance_and_processing_links_are_adversarial(
    path: tuple[str | int, ...], value: object
) -> None:
    payload = _prepared_document()
    target: object = payload
    for key in path[:-1]:
        target = target[key]  # type: ignore[index]
    target[path[-1]] = value  # type: ignore[index]

    if path[:2] == ("processing", "source") or path[:2] == ("processing", "selection"):
        processing_hash = FingerprintPayload.model_validate(payload["processing"]).fingerprint()
        payload["processingFingerprint"] = processing_hash
        payload["metadata"]["processingFingerprint"] = processing_hash  # type: ignore[index]
    _rehash_prepared(payload)
    with pytest.raises(ValidationError):
        PreparedDocument.model_validate(payload)


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("pages", 0, "documentId"), "madoz-12"),
        (("pages", 0, "pageId"), SHA_0),
        (("pages", 0, "lines", 0, "lineId"), SHA_0),
        (("pages", 0, "originalText"), "MÁLAGA: ciudad histórica alterada."),
        (("pages", 0, "lines", 0, "role"), "header"),
        (("pageArtifactHashes", 0), SHA_0),
    ],
)
def test_prepared_document_page_line_artifact_tampering_is_rejected(
    path: tuple[str | int, ...], value: object
) -> None:
    payload = _prepared_document()
    target: object = payload
    for key in path[:-1]:
        target = target[key]  # type: ignore[index]
    target[path[-1]] = value  # type: ignore[index]

    if path[0] == "pageArtifactHashes":
        _rehash_prepared(payload)
    else:
        _rehash_first_page_and_prepared(payload)
    with pytest.raises(ValidationError):
        PreparedDocument.model_validate(payload)


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("chunks", 0, "chunkId"), SHA_0),
        (("chunks", 0, "lineIds"), [SHA_1]),
        (("chunks", 0, "originalText"), "MÁLAGA: ciudad histórica alterada."),
        (("chunks", 0, "pageEnd"), 2),
        (("chunks", 0, "ocrConfidence"), 0.94),
        (("chunks", 0, "sectionPath", 0), "Diccionario Madoz alterado"),
        (("chunks", 0, "correctedText"), "MÁLAGA: ciudad histórica."),
        (("chunks", 0, "cityQids"), ["Q1"]),
        (("chunks", 0, "entityQids"), ["Q1"]),
        (("chunks", 0, "historicalPeriod"), "1849"),
    ],
)
def test_prepared_document_chunk_field_tampering_is_rejected(
    path: tuple[str | int, ...], value: object
) -> None:
    payload = _prepared_document()
    target: object = payload
    for key in path[:-1]:
        target = target[key]  # type: ignore[index]
    target[path[-1]] = value  # type: ignore[index]
    _rehash_prepared(payload)
    with pytest.raises(ValidationError):
        PreparedDocument.model_validate(payload)


def test_prepared_document_excluded_fields_do_not_change_hash() -> None:
    payload = _prepared_document()
    original_hash = payload["preparedDocumentHash"]

    # Changing only preparedAt and canonicalPdfRelativePath must not change the hash.
    payload["preparedAt"] = "2026-09-03T10:00:00+02:00"
    payload["canonicalPdfRelativePath"] = f"raw/{hashlib.sha256(b'madoz-11').hexdigest()}/{'1' * 64}.pdf"
    _rehash_prepared(payload)
    assert payload["preparedDocumentHash"] == original_hash

    # The canonical path must still match the exact derived safe path.
    expected_path = f"raw/{hashlib.sha256(b'madoz-11').hexdigest()}/{'0' * 64}.pdf"
    assert payload["canonicalPdfRelativePath"] != expected_path
    with pytest.raises(ValidationError):
        PreparedDocument.model_validate(payload)

    # Restore the valid path and verify the document is still valid.
    payload["canonicalPdfRelativePath"] = expected_path
    _rehash_prepared(payload)
    PreparedDocument.model_validate(payload)


def _preparation_report() -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "documentId": "madoz-11",
        "pdfSha256": SHA_0,
        "pageInventorySha256": SHA_1,
        "processingFingerprint": _fingerprint().fingerprint(),
        "preparedDocumentHash": SHA_3,
        "publicationGate": _publication_gate(),
        "prepareAllowed": True,
        "publishAllowed": False,
        "blockingReasons": ["coverage_not_accepted", "rights_not_reusable"],
        "candidatePdfPages": 1,
        "logicalPages": 1,
        "inventoryIncluded": 1,
        "inventoryExcludedDuplicates": 0,
        "inventoryExcludedNonbody": 0,
        "blankPages": [],
        "ocrPages": 1,
        "lowQualityPages": [],
        "unassignedBodyLines": 0,
        "chunks": 1,
        "stageRelativePath": "staging/0123456789abcdef/preparation-report.json",
        "preparedAt": "2026-09-02T20:00:00+02:00",
    }


def test_preparation_report_shape_is_valid() -> None:
    report = PreparationReport.model_validate(_preparation_report())
    assert report.documentId == "madoz-11"

    with pytest.raises(ValidationError):
        PreparationReport.model_validate({**report.model_dump(mode="json"), "extra": "forbidden"})
    with pytest.raises(ValidationError):
        PreparationReport.model_validate({**report.model_dump(mode="json"), "preparedAt": "2026-09-02T20:00:00"})


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("candidatePdfPages", 2),
        ("logicalPages", 2),
        ("ocrPages", 2),
        ("blankPages", [2]),
        ("lowQualityPages", [2]),
        ("inventoryIncluded", 0),
        ("publishAllowed", True),
    ],
)
def test_preparation_report_structurally_valid_mutations_are_rejected(
    field: str, value: object
) -> None:
    payload = _preparation_report()
    payload[field] = value  # type: ignore[index]
    with pytest.raises(ValidationError):
        PreparationReport.model_validate(payload)


def test_prepared_document_accepted_coverage_rehash_is_valid() -> None:
    payload = _prepared_document()
    accepted_at = "2026-09-02T20:00:00+02:00"
    payload["metadata"]["coverageAcceptedForProduct"] = True  # type: ignore[index]
    payload["metadata"]["coverageAcceptedAt"] = accepted_at  # type: ignore[index]
    payload["publicationGate"]["coverage"]["acceptedForProduct"] = True  # type: ignore[index]
    payload["publicationGate"]["coverage"]["acceptedAt"] = accepted_at  # type: ignore[index]
    _rehash_prepared(payload)
    PreparedDocument.model_validate(payload)


def test_prepared_document_excluded_inventory_geometry_is_valid() -> None:
    payload = _prepared_document()
    page_json = payload["pages"][0]  # type: ignore[index]
    exclude_record = _inventory(
        pdfPage=40,
        printedLabelCandidates=[{"text": "33.", "box": _box()}],
        normalizedPrintedLabel="33",
        canonicalStatus="exclude_nonbody",
        canonicalSequenceIndex=None,
        decisionReason="No body content.",
    )
    exclude_json = PageInventoryRecord.model_validate(exclude_record).model_dump(
        mode="json", by_alias=True, exclude_none=False
    )
    payload["inventoryRecords"].append(exclude_json)  # type: ignore[union-attr]
    inventory_sha256 = "sha256:" + hashlib.sha256(
        b"".join(
            canonical_json_bytes(record) + b"\n"
            for record in payload["inventoryRecords"]  # type: ignore[union-attr]
        )
    ).hexdigest()
    payload["pageInventorySha256"] = inventory_sha256
    payload["metadata"]["pageInventorySha256"] = inventory_sha256  # type: ignore[index]
    payload["canonicalization"]["pageOverrides"] = [  # type: ignore[index]
        {
            "pdfPage": 40,
            "side": "full",
            "normalizedPrintedLabel": None,
            "canonicalStatus": "exclude_nonbody",
            "reason": "No body content.",
        }
    ]
    processing = payload["processing"]  # type: ignore[index]
    processing["selection"]["candidatePdfPageRanges"] = [{"start": 39, "end": 40}]  # type: ignore[index]
    processing["selection"]["pageInventorySha256"] = inventory_sha256  # type: ignore[index]
    processing["selection"]["canonicalization"] = deepcopy(payload["canonicalization"])  # type: ignore[index]
    processing["selection"]["leafGeometry"].append(  # type: ignore[union-attr]
        {
            "pdfPage": 40,
            "side": "full",
            "cropBox": page_json["cropBox"],
            "rotationDegrees": page_json["rotationDegrees"],
            "widthPx": page_json["widthPx"],
            "heightPx": page_json["heightPx"],
        }
    )
    processing_hash = FingerprintPayload.model_validate(processing).fingerprint()
    payload["processing"] = FingerprintPayload.model_validate(processing).model_dump(
        mode="json", by_alias=True, exclude_none=False
    )
    payload["processingFingerprint"] = processing_hash
    payload["metadata"]["processingFingerprint"] = processing_hash  # type: ignore[index]
    _rehash_prepared(payload)
    PreparedDocument.model_validate(payload)


def _recompute_fingerprint_and_rehash(payload: dict[str, object]) -> None:
    processing = payload["processing"]  # type: ignore[index]
    processing_hash = FingerprintPayload.model_validate(processing).fingerprint()
    payload["processing"] = FingerprintPayload.model_validate(processing).model_dump(
        mode="json", by_alias=True, exclude_none=False
    )
    payload["processingFingerprint"] = processing_hash
    payload["metadata"]["processingFingerprint"] = processing_hash  # type: ignore[index]
    _rehash_prepared(payload)


def test_canonicalization_page_override_mismatch_is_rejected() -> None:
    payload = _prepared_document()
    override = {
        "pdfPage": 39,
        "side": "full",
        "normalizedPrintedLabel": "33",
        "canonicalStatus": None,
        "reason": "Lectura visual.",
    }
    payload["canonicalization"]["pageOverrides"] = [override]  # type: ignore[index]
    processing = payload["processing"]  # type: ignore[index]
    processing["selection"]["canonicalization"] = deepcopy(payload["canonicalization"])  # type: ignore[index]
    _recompute_fingerprint_and_rehash(payload)
    with pytest.raises(ValidationError):
        PreparedDocument.model_validate(payload)


def test_leaf_override_content_class_mismatch_is_rejected() -> None:
    payload = _prepared_document()
    leaf_override = {
        "pdfPage": 39,
        "side": "full",
        "contentClass": "table",
        "rotationDegrees": 0,
    }
    processing = payload["processing"]  # type: ignore[index]
    processing["selection"]["leafOverrides"] = [leaf_override]  # type: ignore[index]
    _recompute_fingerprint_and_rehash(payload)
    with pytest.raises(ValidationError):
        PreparedDocument.model_validate(payload)


def test_prepared_document_embedded_page_provenance_matches_embedded_first_fingerprint() -> None:
    payload = _prepared_document()
    page_json = payload["pages"][0]  # type: ignore[index]
    page_json["textSource"] = "embedded"  # type: ignore[index]
    page_json["ocrEngine"] = "pymupdf"  # type: ignore[index]
    page_json["ocrEngineVersion"] = "1.28.2"  # type: ignore[index]
    page_json["ocrDetectionModel"] = "pdf-text-layer"  # type: ignore[index]
    page_json["ocrRecognitionModel"] = "pdf-text-layer"  # type: ignore[index]

    processing = payload["processing"]  # type: ignore[index]
    processing["ocr"]["textMode"] = "embedded_first"  # type: ignore[index]
    processing["ocr"]["embeddedPolicy"] = "madoz-embedded-v1"  # type: ignore[index]
    processing["ocr"]["embeddedMinCharacters"] = 20  # type: ignore[index]
    processing["ocr"]["embeddedMinAlphabeticRatio"] = 0.4  # type: ignore[index]
    processing["ocr"]["embeddedMaxTokenRepetitionRatio"] = 0.5  # type: ignore[index]

    payload["pageArtifactHashes"][0] = _canonical_hash(page_json)  # type: ignore[index]
    _recompute_fingerprint_and_rehash(payload)
    PreparedDocument.model_validate(payload)

    page_json["ocrEngineVersion"] = "9.9.9"  # type: ignore[index]
    payload["pageArtifactHashes"][0] = _canonical_hash(page_json)  # type: ignore[index]
    _rehash_prepared(payload)
    with pytest.raises(ValidationError):
        PreparedDocument.model_validate(payload)


def test_ocr_engine_version_mismatch_is_rejected() -> None:
    payload = _prepared_document()
    page_json = payload["pages"][0]  # type: ignore[index]
    page_json["ocrEngineVersion"] = "9.9.9"  # type: ignore[index]
    payload["pageArtifactHashes"][0] = _canonical_hash(page_json)  # type: ignore[index]
    _rehash_prepared(payload)
    with pytest.raises(ValidationError):
        PreparedDocument.model_validate(payload)


def test_ocr_fingerprint_v1_literals_are_rejected() -> None:
    payload = _fingerprint()
    for field, value in [
        ("documentOrientationClassification", True),
        ("documentUnwarping", True),
        ("textLineOrientation", False),
    ]:
        bad = deepcopy(payload.model_dump(mode="json"))
        bad["ocr"][field] = value  # type: ignore[index]
        with pytest.raises(ValidationError):
            FingerprintPayload.model_validate(bad)


def test_fingerprint_payload_deep_list_containers_are_immutable() -> None:
    payload = _fingerprint()
    with pytest.raises((AttributeError, TypeError)):
        payload.selection.candidatePdfPageRanges.append({"start": 2, "end": 3})  # type: ignore[union-attr]
    with pytest.raises((AttributeError, TypeError)):
        payload.selection.leafOverrides.append({"pdfPage": 1, "side": "full", "contentClass": "table", "rotationDegrees": 0})  # type: ignore[union-attr]
    with pytest.raises((AttributeError, TypeError)):
        payload.selection.leafGeometry.append({"pdfPage": 1, "side": "full", "cropBox": {"x0": 0.0, "y0": 0.0, "x1": 1.0, "y1": 1.0}, "rotationDegrees": 0, "widthPx": 100, "heightPx": 200})  # type: ignore[union-attr]
    with pytest.raises((AttributeError, TypeError)):
        payload.modelLock.models.append({"name": "extra", "files": []})  # type: ignore[union-attr]


def test_prepared_document_rejects_shared_line_across_different_entries() -> None:
    payload = _prepared_document()
    original_chunk = payload["chunks"][0]  # type: ignore[index]
    clone = deepcopy(original_chunk)
    clone["entryTitle"] = "MALAGA BIS"
    clone["sectionPath"][-1] = "MALAGA BIS"  # type: ignore[index]
    clone["chunkId"] = compute_chunk_id(
        "madoz-11",
        1,
        1,
        clone["sectionPath"],  # type: ignore[arg-type]
        clone["originalText"],  # type: ignore[arg-type]
    )
    payload["chunks"].append(clone)  # type: ignore[union-attr]
    payload["chunks"].sort(key=lambda c: c["chunkId"])  # type: ignore[union-attr]
    _rehash_prepared(payload)
    with pytest.raises(ValidationError):
        PreparedDocument.model_validate(payload)


def test_prepared_document_rejects_pending_duplicate_candidate() -> None:
    payload = _prepared_document()
    inventory_json = payload["inventoryRecords"][0]  # type: ignore[index]
    inventory_json["duplicateCandidates"] = [  # type: ignore[index]
        {
            "pdfPage": 40,
            "side": "full",
            "reasons": ["dhash_le_5", "same_label"],
            "decision": "pending",
            "canonical": None,
            "decisionReason": None,
        }
    ]
    inventory_json["anomalyFlags"] = ["near_duplicate"]  # type: ignore[index]
    inventory_sha256 = "sha256:" + hashlib.sha256(
        b"".join(
            canonical_json_bytes(record) + b"\n"
            for record in payload["inventoryRecords"]  # type: ignore[union-attr]
        )
    ).hexdigest()
    payload["pageInventorySha256"] = inventory_sha256
    payload["metadata"]["pageInventorySha256"] = inventory_sha256  # type: ignore[index]
    processing = payload["processing"]  # type: ignore[index]
    processing["selection"]["pageInventorySha256"] = inventory_sha256  # type: ignore[index]
    processing_hash = FingerprintPayload.model_validate(processing).fingerprint()
    payload["processing"] = FingerprintPayload.model_validate(processing).model_dump(
        mode="json", by_alias=True, exclude_none=False
    )
    payload["processingFingerprint"] = processing_hash
    payload["metadata"]["processingFingerprint"] = processing_hash  # type: ignore[index]
    _rehash_prepared(payload)
    with pytest.raises(ValidationError):
        PreparedDocument.model_validate(payload)


def test_preparation_report_publish_requires_prepare() -> None:
    payload = _preparation_report()
    gate = payload["publicationGate"]  # type: ignore[index]
    gate["coverage"]["acceptedForProduct"] = True  # type: ignore[index]
    gate["coverage"]["acceptedAt"] = "2026-09-02T20:00:00+02:00"  # type: ignore[index]
    payload["publishAllowed"] = True  # type: ignore[index]
    payload["prepareAllowed"] = False  # type: ignore[index]
    with pytest.raises(ValidationError):
        PreparationReport.model_validate(payload)
