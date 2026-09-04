from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import pymupdf
import pytest

from historical_corpus.ingest_models import (
    FingerprintPayload,
    ModelLock,
    ModelLockEntry,
    ModelLockFile,
    SoftwareVersions,
)
from historical_corpus.manifest import MadozManifest
from historical_corpus.pdf_source import iter_rendered_leaves
from historical_corpus.processing_fingerprint import (
    CanonicalPdf,
    ProcessingFingerprintError,
    build_processing_fingerprint,
)


GOLDEN_FINGERPRINT = (
    "sha256:21d527034ae1158ab887870c0a57236edbb3a3331bfbe982eccc0e34d7d70c75"
)
SOURCE_HASH = "0" * 64
INVENTORY_HASH = "1" * 64


def _manifest_data() -> dict[str, object]:
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
            "expectedSha256": SOURCE_HASH,
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
            "expectedPageInventorySha256": INVENTORY_HASH,
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
            "maxChunkChars": 1500,
            "overlapLines": 2,
            "layoutPolicy": "madoz-two-column-v1",
            "entryPolicy": "madoz-entry-v1",
        },
    }


def _manifest(data: dict[str, object] | None = None) -> MadozManifest:
    return MadozManifest.model_validate(data or _manifest_data())


def _software(**updates: str) -> SoftwareVersions:
    values = {
        "pymupdf": "1.28.2",
        "paddleocr": "3.7.0",
        "paddlex": "3.7.2",
        "transformers": "5.16.1",
        "torch": "2.13.0",
        "numpy": "2.3.5",
    }
    values.update(updates)
    return SoftwareVersions(**values)


def _model_lock(
    *,
    detection_cache: str = "cache/detection",
    recognition_cache: str = "cache/recognition",
    detection_hash: str = "2" * 64,
) -> ModelLock:
    return ModelLock(
        schemaVersion=1,
        paddleOcrVersion="3.7.0",
        paddleXVersion="3.7.2",
        transformersVersion="5.16.1",
        engine="transformers",
        models=[
            ModelLockEntry(
                name="PP-OCRv6_medium_det",
                cacheRelativePath=detection_cache,
                files=[
                    ModelLockFile(
                        relativePath="model.json",
                        sizeBytes=1,
                        sha256=f"sha256:{detection_hash}",
                    )
                ],
            ),
            ModelLockEntry(
                name="PP-OCRv6_medium_rec",
                cacheRelativePath=recognition_cache,
                files=[
                    ModelLockFile(
                        relativePath="model.json",
                        sizeBytes=1,
                        sha256=f"sha256:{'3' * 64}",
                    )
                ],
            ),
        ],
    )


def _pdf(path: Path, *, width: float = 24, height: float = 48, pages: int = 1) -> Path:
    document = pymupdf.open()
    try:
        for _ in range(pages):
            document.new_page(width=width, height=height)
        document.save(path)
    finally:
        document.close()
    return path


def _canonical(path: Path, source_hash: str = SOURCE_HASH) -> CanonicalPdf:
    return CanonicalPdf(path=path, sha256=f"sha256:{source_hash}")


def _build(
    manifest: MadozManifest,
    canonical: CanonicalPdf,
    *,
    inventory_hash: str = INVENTORY_HASH,
    model_lock: ModelLock | None = None,
    software: SoftwareVersions | None = None,
) -> tuple[FingerprintPayload, str]:
    return build_processing_fingerprint(
        manifest,
        canonical,
        f"sha256:{inventory_hash}",
        model_lock or _model_lock(),
        software or _software(),
    )


def test_builder_reproduces_the_normative_golden_vector(tmp_path: Path) -> None:
    payload, fingerprint = _build(
        _manifest(),
        _canonical(_pdf(tmp_path / "source.pdf")),
    )

    assert isinstance(payload, FingerprintPayload)
    assert fingerprint == payload.fingerprint() == GOLDEN_FINGERPRINT
    assert payload.model_dump(mode="json") == {
        "fingerprintSchemaVersion": 1,
        "manifestSchemaVersion": 1,
        "source": {"canonicalPdfSha256": f"sha256:{SOURCE_HASH}"},
        "selection": {
            "candidatePdfPageRanges": [{"start": 1, "end": 1}],
            "pageInventorySha256": f"sha256:{INVENTORY_HASH}",
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
        "software": _software().model_dump(mode="json"),
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
                    "files": [
                        {
                            "relativePath": "model.json",
                            "sizeBytes": 1,
                            "sha256": f"sha256:{'2' * 64}",
                        }
                    ],
                },
                {
                    "name": "PP-OCRv6_medium_rec",
                    "files": [
                        {
                            "relativePath": "model.json",
                            "sizeBytes": 1,
                            "sha256": f"sha256:{'3' * 64}",
                        }
                    ],
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


def test_leaf_geometry_uses_metadata_only_and_matches_crop_rotation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    data = _manifest_data()
    selection = data["selection"]
    assert isinstance(selection, dict)
    selection["splitSpreads"] = True
    selection["innerGutterTrimRatio"] = 0.01
    selection["leafOverrides"] = [
        {
            "pdfPage": 1,
            "side": "right",
            "contentClass": "mixed_orientation",
            "rotationDegrees": 90,
            "tableRegions": [
                {
                    "box": [0.1, 0.2, 0.3, 0.4],
                    "ocrRotationDegrees": 270,
                }
            ],
        }
    ]
    path = _pdf(tmp_path / "spread.pdf", width=72, height=144)

    def forbid_rasterization(*args: object, **kwargs: object) -> object:
        raise AssertionError("fingerprinting must not rasterize")

    monkeypatch.setattr(pymupdf.Page, "get_pixmap", forbid_rasterization)
    payload, _ = _build(_manifest(data), _canonical(path))

    assert [item.model_dump(mode="json") for item in payload.selection.leafGeometry] == [
        {
            "pdfPage": 1,
            "side": "left",
            "cropBox": {"x0": 0.0, "y0": 0.0, "x1": 0.49, "y1": 1.0},
            "rotationDegrees": 0,
            "widthPx": 147,
            "heightPx": 600,
        },
        {
            "pdfPage": 1,
            "side": "right",
            "cropBox": {"x0": 0.51, "y0": 0.0, "x1": 1.0, "y1": 1.0},
            "rotationDegrees": 90,
            "widthPx": 600,
            "heightPx": 147,
        },
    ]
    assert payload.selection.leafOverrides[0].model_dump(mode="json") == {
        "pdfPage": 1,
        "side": "right",
        "contentClass": "mixed_orientation",
        "rotationDegrees": 90,
        "tableRegions": [
            {
                "box": {"x0": 0.1, "y0": 0.2, "x1": 0.3, "y1": 0.4},
                "ocrRotationDegrees": 270,
            }
        ],
    }


def test_leaf_geometry_metadata_matches_rendered_leaf_dimensions(
    tmp_path: Path,
) -> None:
    data = _manifest_data()
    selection = data["selection"]
    assert isinstance(selection, dict)
    selection["splitSpreads"] = True
    selection["gutterRatio"] = 0.5
    selection["innerGutterTrimRatio"] = 0.01
    selection["leafOverrides"] = [
        {
            "pdfPage": 1,
            "side": "right",
            "contentClass": "normal",
            "rotationDegrees": 270,
            "tableRegions": [],
        }
    ]
    path = _pdf(tmp_path / "spread.pdf", width=10.5, height=21.25)
    manifest = _manifest(data)
    payload, _ = _build(manifest, _canonical(path))

    rendered = list(iter_rendered_leaves(path, manifest))
    assert len(rendered) == len(payload.selection.leafGeometry)

    for geometry, leaf in zip(payload.selection.leafGeometry, rendered):
        assert (
            geometry.pdfPage,
            geometry.side,
            geometry.widthPx,
            geometry.heightPx,
            geometry.rotationDegrees,
        ) == (
            leaf.candidate.pdf_page,
            leaf.candidate.side,
            leaf.width_px,
            leaf.height_px,
            leaf.candidate.rotation_degrees,
        )


def test_all_variable_processing_ingredients_affect_the_fingerprint(tmp_path: Path) -> None:
    path = _pdf(tmp_path / "source.pdf")
    baseline = _build(_manifest(), _canonical(path))[1]

    source_data = _manifest_data()
    source_data["source"]["expectedSha256"] = "4" * 64
    source_changed = _build(
        _manifest(source_data),
        _canonical(path, "4" * 64),
    )[1]

    inventory_data = _manifest_data()
    inventory_data["selection"]["expectedPageInventorySha256"] = "5" * 64
    inventory_changed = _build(
        _manifest(inventory_data),
        _canonical(path),
        inventory_hash="5" * 64,
    )[1]

    threshold_data = _manifest_data()
    threshold_data["processing"]["lowConfidenceThreshold"] = 0.61
    threshold_changed = _build(_manifest(threshold_data), _canonical(path))[1]

    chunk_data = _manifest_data()
    chunk_data["processing"]["maxChunkChars"] = 1499
    chunk_changed = _build(_manifest(chunk_data), _canonical(path))[1]

    changed = {
        source_changed,
        inventory_changed,
        threshold_changed,
        chunk_changed,
        _build(_manifest(), _canonical(path), software=_software(numpy="2.3.6"))[1],
        _build(
            _manifest(),
            _canonical(path),
            model_lock=_model_lock(detection_hash="4" * 64),
        )[1],
    }
    assert baseline not in changed
    assert len(changed) == 6


def test_excluded_operational_and_editorial_fields_do_not_affect_fingerprint(
    tmp_path: Path,
) -> None:
    first_path = _pdf(tmp_path / "first.pdf")
    second_path = _pdf(tmp_path / "second.pdf")
    baseline = _build(_manifest(), _canonical(first_path))[1]

    data = deepcopy(_manifest_data())
    data["document"]["title"] = "Another editorial title"
    data["source"]["sourceUrl"] = "https://example.org/another-record"
    data["source"]["rights"]["uri"] = "https://example.org/other-rights"
    data["selection"]["pageInventoryPath"] = "inventory/moved.jsonl"
    data["selection"]["inventoryVerifiedAt"] = "2026-09-03T00:00:00+02:00"
    changed_lock = _model_lock(
        detection_cache="moved/detection",
        recognition_cache="moved/recognition",
    )

    assert _build(
        _manifest(data),
        _canonical(second_path),
        model_lock=changed_lock,
    )[1] == baseline


@pytest.mark.parametrize("case", ["canonical_hash", "inventory_hash", "inventory_format"])
def test_builder_rejects_hash_mismatches(tmp_path: Path, case: str) -> None:
    manifest = _manifest()
    canonical = _canonical(_pdf(tmp_path / "source.pdf"))
    inventory = f"sha256:{INVENTORY_HASH}"
    if case == "canonical_hash":
        canonical = _canonical(canonical.path, "4" * 64)
    elif case == "inventory_hash":
        inventory = f"sha256:{'4' * 64}"
    else:
        inventory = INVENTORY_HASH

    with pytest.raises(ProcessingFingerprintError):
        build_processing_fingerprint(
            manifest,
            canonical,
            inventory,
            _model_lock(),
            _software(),
        )


@pytest.mark.parametrize("case", ["missing", "symlink", "invalid", "page_outside"])
def test_builder_rejects_unusable_canonical_pdf(tmp_path: Path, case: str) -> None:
    path = tmp_path / "source.pdf"
    data = _manifest_data()
    if case == "missing":
        pass
    elif case == "symlink":
        target = _pdf(tmp_path / "target.pdf")
        path.symlink_to(target)
    elif case == "invalid":
        path.write_bytes(b"not a pdf")
    else:
        _pdf(path)
        data["selection"]["candidatePdfPageRanges"] = [{"start": 2, "end": 2}]

    with pytest.raises(ProcessingFingerprintError):
        _build(_manifest(data), _canonical(path))


def _embedded_first_data(
    *,
    embedded_min_characters: int = 64,
    embedded_min_alphabetic_ratio: float = 0.35,
    embedded_max_token_repetition_ratio: float = 0.20,
) -> dict[str, object]:
    data = _manifest_data()
    processing = data["processing"]
    assert isinstance(processing, dict)
    processing["textMode"] = "embedded_first"
    processing["embeddedPolicy"] = "madoz-embedded-v1"
    processing["embeddedMinCharacters"] = embedded_min_characters
    processing["embeddedMinAlphabeticRatio"] = embedded_min_alphabetic_ratio
    processing["embeddedMaxTokenRepetitionRatio"] = embedded_max_token_repetition_ratio
    return data


def test_no_corrections_fingerprint_omits_corrections_key(
    tmp_path: Path,
) -> None:
    path = _pdf(tmp_path / "source.pdf")
    payload, fingerprint = _build(_manifest(), _canonical(path))
    dumped = payload.model_dump(mode="json")
    assert "corrections" not in dumped
    assert fingerprint == payload.fingerprint() == GOLDEN_FINGERPRINT


def test_corrections_enabled_fingerprint_includes_correction_fields(
    tmp_path: Path,
) -> None:
    path = _pdf(tmp_path / "source.pdf")
    data = _manifest_data()
    data["processing"]["corrections"] = {
        "path": "corrections/page-1.json",
        "expectedSha256": "a" * 64,
        "authority": "ai_adjudicated",
        "reviewStatus": "ai_adjudicated_not_human_certified",
    }
    payload, fingerprint = _build(_manifest(data), _canonical(path))
    dumped = payload.model_dump(mode="json")
    assert "corrections" in dumped
    assert dumped["corrections"] == {
        "setRelativePath": "corrections/page-1.json",
        "setSha256": f"sha256:{'a' * 64}",
        "authority": "ai_adjudicated",
        "reviewStatus": "ai_adjudicated_not_human_certified",
    }
    assert fingerprint == payload.fingerprint()


def test_changing_only_correction_hash_changes_fingerprint(
    tmp_path: Path,
) -> None:
    path = _pdf(tmp_path / "source.pdf")
    data = _manifest_data()
    data["processing"]["corrections"] = {
        "path": "corrections/page-1.json",
        "expectedSha256": "a" * 64,
        "authority": "ai_adjudicated",
        "reviewStatus": "ai_adjudicated_not_human_certified",
    }
    baseline_payload, baseline_fingerprint = _build(
        _manifest(data), _canonical(path)
    )

    changed_data = deepcopy(data)
    changed_data["processing"]["corrections"]["expectedSha256"] = "b" * 64
    changed_payload, changed_fingerprint = _build(
        _manifest(changed_data), _canonical(path)
    )

    assert changed_fingerprint != baseline_fingerprint
    assert changed_payload.model_dump(mode="json")["corrections"]["setSha256"] == (
        f"sha256:{'b' * 64}"
    )


def test_embedded_first_payload_contains_text_mode_and_thresholds(tmp_path: Path) -> None:
    path = _pdf(tmp_path / "source.pdf")
    payload, fingerprint = _build(
        _manifest(_embedded_first_data()),
        _canonical(path),
    )

    ocr = payload.ocr
    assert ocr.textMode == "embedded_first"
    assert ocr.embeddedPolicy == "madoz-embedded-v1"
    assert ocr.embeddedMinCharacters == 64
    assert ocr.embeddedMinAlphabeticRatio == 0.35
    assert ocr.embeddedMaxTokenRepetitionRatio == 0.20
    assert fingerprint == payload.fingerprint()


def test_embedded_first_fingerprint_differs_from_equivalent_ocr(tmp_path: Path) -> None:
    path = _pdf(tmp_path / "source.pdf")
    ocr_payload, ocr_fingerprint = _build(
        _manifest(),
        _canonical(path),
    )
    embedded_payload, embedded_fingerprint = _build(
        _manifest(_embedded_first_data()),
        _canonical(path),
    )

    assert ocr_payload.ocr.textMode == "ocr"
    assert embedded_payload.ocr.textMode == "embedded_first"
    assert embedded_fingerprint != ocr_fingerprint


@pytest.mark.parametrize(
    "field, value",
    [
        ("embeddedMinCharacters", 65),
        ("embeddedMinAlphabeticRatio", 0.40),
        ("embeddedMaxTokenRepetitionRatio", 0.25),
    ],
)
def test_each_embedded_threshold_change_alters_fingerprint(
    tmp_path: Path,
    field: str,
    value: object,
) -> None:
    path = _pdf(tmp_path / "source.pdf")
    baseline_payload, baseline_fingerprint = _build(
        _manifest(_embedded_first_data()),
        _canonical(path),
    )

    data = _embedded_first_data()
    processing = data["processing"]
    assert isinstance(processing, dict)
    processing[field] = value
    changed_payload, changed_fingerprint = _build(
        _manifest(data),
        _canonical(path),
    )

    assert changed_payload.ocr.textMode == "embedded_first"
    assert changed_fingerprint != baseline_fingerprint
