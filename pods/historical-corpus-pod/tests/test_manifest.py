from __future__ import annotations

import hashlib
import os
from copy import deepcopy
from pathlib import Path

import pymupdf
import pytest
import yaml

from historical_corpus.manifest import (
    ManifestValidationError,
    MadozManifest,
    ValidatedManifestSource,
    load_manifest,
    validate_manifest_source,
)


def _manifest() -> dict[str, object]:
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
            "candidatePdfPageRanges": [{"start": 1, "end": 2}],
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
            "splitSpreads": False,
            "gutterRatio": 0.5,
            "innerGutterTrimRatio": 0.005,
            "leafOverrides": [
                {
                    "pdfPage": 1,
                    "side": "full",
                    "contentClass": "normal",
                    "rotationDegrees": 0,
                    "tableRegions": [],
                }
            ],
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
            "maxChunkChars": 1500,
            "overlapLines": 2,
            "layoutPolicy": "madoz-two-column-v1",
            "entryPolicy": "madoz-entry-v1",
        },
    }


def _write_manifest(root: Path, payload: dict[str, object]) -> Path:
    path = root / "manifest.yaml"
    path.write_text(yaml.safe_dump(payload, sort_keys=False), encoding="utf-8")
    return path


def _pdf_bytes(page_count: int = 2) -> bytes:
    document = pymupdf.open()
    try:
        for _ in range(page_count):
            document.new_page(width=200, height=300)
        return document.tobytes()
    finally:
        document.close()


def _with_source(root: Path, payload: dict[str, object]) -> tuple[Path, bytes]:
    pdf = _pdf_bytes()
    pdf_path = root / payload["source"]["pdfPath"]
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(pdf)
    payload["source"]["expectedSha256"] = hashlib.sha256(pdf).hexdigest()
    return pdf_path, pdf


def _with_verified_inventory(root: Path, payload: dict[str, object]) -> Path:
    inventory_path = root / payload["selection"]["pageInventoryPath"]
    inventory_path.parent.mkdir(parents=True, exist_ok=True)
    inventory_bytes = b'{"schemaVersion":1}\n'
    inventory_path.write_bytes(inventory_bytes)
    selection = payload["selection"]
    selection["expectedPageInventorySha256"] = hashlib.sha256(
        inventory_bytes
    ).hexdigest()
    selection["inventoryReviewStatus"] = "verified"
    selection["inventoryVerifiedAt"] = "2026-09-03T08:00:00+02:00"
    return inventory_path


def test_structural_load_is_typed_and_does_not_require_files(tmp_path: Path) -> None:
    manifest = load_manifest(_write_manifest(tmp_path, _manifest()))
    assert isinstance(manifest, MadozManifest)
    assert manifest.schemaVersion == 1
    assert manifest.source.isExactRecord is True
    assert manifest.prepare_allowed is False
    assert manifest.publish_allowed is False
    assert not (tmp_path / "source.pdf").exists()


def test_manifest_size_limit_precedes_yaml_parsing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "oversize.yaml"
    path.write_bytes(b"x" * 65537)
    called = False

    def forbidden_loader(_payload):
        nonlocal called
        called = True

    monkeypatch.setattr(yaml, "safe_load", forbidden_loader)
    with pytest.raises(ManifestValidationError, match="65536"):
        load_manifest(path)
    assert called is False


def test_unsafe_yaml_constructor_is_rejected_without_execution(tmp_path: Path) -> None:
    marker = tmp_path / "unsafe-marker"
    path = tmp_path / "unsafe.yaml"
    path.write_text(
        f'!!python/object/apply:os.system ["touch {marker}"]', encoding="utf-8"
    )
    with pytest.raises(ManifestValidationError, match="YAML"):
        load_manifest(path)
    assert not marker.exists()


@pytest.mark.parametrize(
    ("section", "field", "value", "error_field"),
    [
        (None, "schemaVersion", "1", "schemaVersion"),
        ("document", "volumeNumber", 11.0, "volumeNumber"),
        ("source", "expectedSha256", "A" * 64, "expectedSha256"),
        ("source", "expectedSha256", "sha256:" + "0" * 64, "expectedSha256"),
        ("source", "pdfPath", "../source.pdf", "pdfPath"),
        ("selection", "pageInventoryPath", "/tmp/pages.jsonl", "pageInventoryPath"),
        ("selection", "gutterRatio", 0.6, "gutterRatio"),
        ("processing", "renderDpi", 149, "renderDpi"),
        ("processing", "ocrEngine", "paddleocr", "ocrEngine"),
        ("processing", "documentOrientationClassification", "false", "documentOrientationClassification"),
        ("processing", "lowConfidenceThreshold", float("nan"), "lowConfidenceThreshold"),
        ("processing", "maxChunkChars", 255, "maxChunkChars"),
        ("processing", "overlapLines", 33, "overlapLines"),
    ],
)
def test_strict_structural_validation(
    tmp_path: Path,
    section: str | None,
    field: str,
    value: object,
    error_field: str,
) -> None:
    payload = _manifest()
    target = payload if section is None else payload[section]
    target[field] = value
    with pytest.raises(ManifestValidationError, match=error_field):
        load_manifest(_write_manifest(tmp_path, payload))


def test_required_exact_record_and_recursive_extra_forbid(tmp_path: Path) -> None:
    missing = _manifest()
    del missing["source"]["isExactRecord"]
    with pytest.raises(ManifestValidationError, match="isExactRecord"):
        load_manifest(_write_manifest(tmp_path, missing))

    extra = _manifest()
    extra["processing"]["surprise"] = True
    with pytest.raises(ManifestValidationError, match="surprise"):
        load_manifest(_write_manifest(tmp_path, extra))


def test_controls_are_allowed_only_in_descriptive_text(tmp_path: Path) -> None:
    structured = _manifest()
    structured["document"]["documentId"] = "madoz\nother"
    with pytest.raises(ManifestValidationError, match="documentId"):
        load_manifest(_write_manifest(tmp_path, structured))

    descriptive = _manifest()
    descriptive["coverage"]["statement"] = "First line\nSecond\tcolumn"
    assert load_manifest(_write_manifest(tmp_path, descriptive)).coverage.statement == (
        "First line\nSecond\tcolumn"
    )


def test_selection_order_uniqueness_and_region_overlap(tmp_path: Path) -> None:
    ranges = _manifest()
    ranges["selection"]["candidatePdfPageRanges"] = [
        {"start": 2, "end": 2},
        {"start": 1, "end": 1},
    ]
    with pytest.raises(ManifestValidationError, match="candidatePdfPageRanges"):
        load_manifest(_write_manifest(tmp_path, ranges))

    duplicate = _manifest()
    duplicate["selection"]["leafOverrides"] *= 2
    with pytest.raises(ManifestValidationError, match="leafOverrides"):
        load_manifest(_write_manifest(tmp_path, duplicate))

    overlap = _manifest()
    overlap["selection"]["leafOverrides"][0]["tableRegions"] = [
        {"box": [0.0, 0.0, 0.7, 0.7]},
        {"box": [0.5, 0.5, 1.0, 1.0], "ocrRotationDegrees": 90},
    ]
    with pytest.raises(ManifestValidationError, match="tableRegions"):
        load_manifest(_write_manifest(tmp_path, overlap))


def test_prepare_and_publish_gates_are_separate(tmp_path: Path) -> None:
    payload = _manifest()
    _with_verified_inventory(tmp_path, payload)
    manifest = load_manifest(_write_manifest(tmp_path, payload))
    assert manifest.prepare_allowed is True
    assert manifest.publish_allowed is False

    payload["source"]["rights"] = {
        "status": "reviewed_reusable",
        "uri": "https://example.org/rights",
        "verifiedAt": "2026-09-03T08:00:00+02:00",
        "isExplicitlyReusable": True,
    }
    payload["coverage"]["acceptedForProduct"] = True
    payload["coverage"]["acceptedAt"] = "2026-09-03T08:00:00+02:00"
    manifest = load_manifest(_write_manifest(tmp_path, payload))
    assert manifest.prepare_allowed is True
    assert manifest.publish_allowed is True

    for gate in ("inventory", "source", "rights", "coverage"):
        rejected = deepcopy(payload)
        if gate == "inventory":
            rejected["selection"]["inventoryReviewStatus"] = "pending"
            rejected["selection"]["inventoryVerifiedAt"] = None
        elif gate == "source":
            rejected["source"]["isExactRecord"] = False
        elif gate == "rights":
            rejected["source"]["rights"] = _manifest()["source"]["rights"]
        else:
            rejected["coverage"]["acceptedForProduct"] = False
            rejected["coverage"]["acceptedAt"] = None
        rejected_manifest = load_manifest(_write_manifest(tmp_path, rejected))
        assert rejected_manifest.publish_allowed is False, gate


def test_source_validation_returns_typed_local_evidence(tmp_path: Path) -> None:
    payload = _manifest()
    pdf_path, pdf = _with_source(tmp_path, payload)
    manifest = load_manifest(_write_manifest(tmp_path, payload))
    result = validate_manifest_source(manifest, tmp_path)
    assert isinstance(result, ValidatedManifestSource)
    assert result.pdf_path == pdf_path.resolve()
    assert result.inventory_path == (tmp_path / "inventory/pages.jsonl").resolve()
    assert result.pdf_sha256 == hashlib.sha256(pdf).hexdigest()
    assert result.inventory_sha256 is None
    assert result.pdf_page_count == 2


@pytest.mark.parametrize("failure", ["missing", "directory", "mismatch", "symlink", "parent_symlink"])
def test_source_path_and_hash_fail_closed(tmp_path: Path, failure: str) -> None:
    payload = _manifest()
    pdf_path, _ = _with_source(tmp_path, payload)
    sentinel = tmp_path / "sentinel.pdf"
    if failure == "missing":
        pdf_path.unlink()
    elif failure == "directory":
        pdf_path.unlink()
        pdf_path.mkdir()
    elif failure == "mismatch":
        pdf_path.write_bytes(b"not the declared pdf")
    elif failure == "symlink":
        sentinel.write_bytes(_pdf_bytes())
        pdf_path.unlink()
        os.symlink(sentinel, pdf_path)
    else:
        outside = tmp_path / "outside"
        outside.mkdir()
        target = outside / "source.pdf"
        target.write_bytes(_pdf_bytes())
        linked = tmp_path / "linked"
        os.symlink(outside, linked)
        payload["source"]["pdfPath"] = "linked/source.pdf"
        payload["source"]["expectedSha256"] = hashlib.sha256(target.read_bytes()).hexdigest()

    manifest = load_manifest(_write_manifest(tmp_path, payload))
    with pytest.raises(ManifestValidationError, match="pdfPath|expectedSha256"):
        validate_manifest_source(manifest, tmp_path)


def test_source_validation_uses_real_pdf_page_count_and_selection(tmp_path: Path) -> None:
    payload = _manifest()
    _with_source(tmp_path, payload)
    payload["selection"]["candidatePdfPageRanges"] = [{"start": 1, "end": 3}]
    manifest = load_manifest(_write_manifest(tmp_path, payload))
    with pytest.raises(ManifestValidationError, match="candidatePdfPageRanges"):
        validate_manifest_source(manifest, tmp_path)

    payload["selection"]["candidatePdfPageRanges"] = [{"start": 2, "end": 2}]
    manifest = load_manifest(_write_manifest(tmp_path, payload))
    with pytest.raises(ManifestValidationError, match="leafOverrides"):
        validate_manifest_source(manifest, tmp_path)


def test_verified_inventory_is_hash_checked(tmp_path: Path) -> None:
    payload = _manifest()
    _with_source(tmp_path, payload)
    inventory_path = _with_verified_inventory(tmp_path, payload)
    manifest = load_manifest(_write_manifest(tmp_path, payload))
    result = validate_manifest_source(manifest, tmp_path)
    assert result.inventory_path == inventory_path.resolve()
    assert result.inventory_sha256 == payload["selection"]["expectedPageInventorySha256"]

    inventory_path.write_bytes(b"changed")
    with pytest.raises(ManifestValidationError, match="expectedPageInventorySha256"):
        validate_manifest_source(manifest, tmp_path)


def test_verified_inventory_has_a_two_mib_limit(tmp_path: Path) -> None:
    payload = _manifest()
    _with_source(tmp_path, payload)
    inventory_path = _with_verified_inventory(tmp_path, payload)
    oversized = b"x" * (2 * 1024 * 1024 + 1)
    inventory_path.write_bytes(oversized)
    payload["selection"]["expectedPageInventorySha256"] = hashlib.sha256(
        oversized
    ).hexdigest()
    manifest = load_manifest(_write_manifest(tmp_path, payload))
    with pytest.raises(ManifestValidationError, match="2097152"):
        validate_manifest_source(manifest, tmp_path)


def test_embedded_first_accepts_conditional_contract(tmp_path: Path) -> None:
    payload = _manifest()
    processing = payload["processing"]
    processing["textMode"] = "embedded_first"
    processing["embeddedPolicy"] = "madoz-embedded-v1"
    processing["embeddedMinCharacters"] = 64
    processing["embeddedMinAlphabeticRatio"] = 0.35
    processing["embeddedMaxTokenRepetitionRatio"] = 0.20
    manifest = load_manifest(_write_manifest(tmp_path, payload))
    assert manifest.processing.textMode == "embedded_first"
    assert manifest.processing.embeddedPolicy == "madoz-embedded-v1"
    assert manifest.processing.embeddedMinCharacters == 64
    assert manifest.processing.embeddedMinAlphabeticRatio == 0.35
    assert manifest.processing.embeddedMaxTokenRepetitionRatio == 0.20


@pytest.mark.parametrize(
    "missing_field",
    [
        "embeddedPolicy",
        "embeddedMinCharacters",
        "embeddedMinAlphabeticRatio",
        "embeddedMaxTokenRepetitionRatio",
    ],
)
def test_embedded_first_rejects_missing_required_field(
    tmp_path: Path, missing_field: str
) -> None:
    payload = _manifest()
    processing = payload["processing"]
    processing["textMode"] = "embedded_first"
    processing["embeddedPolicy"] = "madoz-embedded-v1"
    processing["embeddedMinCharacters"] = 64
    processing["embeddedMinAlphabeticRatio"] = 0.35
    processing["embeddedMaxTokenRepetitionRatio"] = 0.20
    del processing[missing_field]
    with pytest.raises(ManifestValidationError, match=missing_field):
        load_manifest(_write_manifest(tmp_path, payload))


def test_manifest_without_corrections_remains_valid(tmp_path: Path) -> None:
    manifest = load_manifest(_write_manifest(tmp_path, _manifest()))
    assert manifest.processing.corrections is None


def test_manifest_with_complete_corrections_is_valid(tmp_path: Path) -> None:
    payload = _manifest()
    payload["processing"]["corrections"] = {
        "path": "corrections/page-1.json",
        "expectedSha256": "a" * 64,
        "authority": "ai_adjudicated",
        "reviewStatus": "ai_adjudicated_not_human_certified",
    }
    manifest = load_manifest(_write_manifest(tmp_path, payload))
    assert manifest.processing.corrections is not None
    assert manifest.processing.corrections.path == "corrections/page-1.json"
    assert manifest.processing.corrections.expectedSha256 == "a" * 64
    assert manifest.processing.corrections.authority == "ai_adjudicated"
    assert (
        manifest.processing.corrections.reviewStatus
        == "ai_adjudicated_not_human_certified"
    )


@pytest.mark.parametrize(
    "mutation",
    [
        "absolute_path",
        "parent_traversal_path",
        "invalid_hash",
        "unsupported_authority",
        "unsupported_review_status",
        "partial_object",
    ],
)
def test_manifest_rejects_invalid_correction_entries(
    tmp_path: Path, mutation: str
) -> None:
    payload = _manifest()
    correction = {
        "path": "corrections/page-1.json",
        "expectedSha256": "a" * 64,
        "authority": "ai_adjudicated",
        "reviewStatus": "ai_adjudicated_not_human_certified",
    }
    if mutation == "absolute_path":
        correction["path"] = "/tmp/corrections/page-1.json"
    elif mutation == "parent_traversal_path":
        correction["path"] = "../corrections/page-1.json"
    elif mutation == "invalid_hash":
        correction["expectedSha256"] = "b" * 63
    elif mutation == "unsupported_authority":
        correction["authority"] = "human_certified"
    elif mutation == "unsupported_review_status":
        correction["reviewStatus"] = "human_certified"
    elif mutation == "partial_object":
        del correction["reviewStatus"]
    payload["processing"]["corrections"] = correction
    with pytest.raises(ManifestValidationError, match="corrections"):
        load_manifest(_write_manifest(tmp_path, payload))


def test_embedded_fields_rejected_when_text_mode_is_ocr(tmp_path: Path) -> None:
    payload = _manifest()
    processing = payload["processing"]
    processing["embeddedPolicy"] = "madoz-embedded-v1"
    processing["embeddedMinCharacters"] = 64
    processing["embeddedMinAlphabeticRatio"] = 0.35
    processing["embeddedMaxTokenRepetitionRatio"] = 0.20
    with pytest.raises(ManifestValidationError, match="embeddedPolicy"):
        load_manifest(_write_manifest(tmp_path, payload))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("embeddedPolicy", "unknown-policy"),
        ("embeddedMinCharacters", 0),
        ("embeddedMinAlphabeticRatio", -0.1),
        ("embeddedMinAlphabeticRatio", 1.1),
        ("embeddedMaxTokenRepetitionRatio", -0.1),
        ("embeddedMaxTokenRepetitionRatio", 1.1),
    ],
)
def test_embedded_first_rejects_out_of_range_values(
    tmp_path: Path, field: str, value: object
) -> None:
    payload = _manifest()
    processing = payload["processing"]
    processing["textMode"] = "embedded_first"
    processing["embeddedPolicy"] = "madoz-embedded-v1"
    processing["embeddedMinCharacters"] = 64
    processing["embeddedMinAlphabeticRatio"] = 0.35
    processing["embeddedMaxTokenRepetitionRatio"] = 0.20
    processing[field] = value
    with pytest.raises(ManifestValidationError, match=field):
        load_manifest(_write_manifest(tmp_path, payload))
