from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from historical_corpus.identity import canonical_json_bytes
from historical_corpus.ingest_models import (
    OcrEvaluationSample,
    PreparationReport,
    PreparedDocument,
    SourcePageInput,
    StagedPage,
)
from historical_corpus.staging import (
    StagingError,
    load_evaluation_sample,
    load_prepared_document,
    load_reusable_staged_page,
    staging_paths,
    write_evaluation_sample,
    write_preparation_report,
    write_prepared_document,
    write_source_snapshot,
    write_staged_page,
)
from test_ingest_models import (
    SHA_0,
    SHA_1,
    _evaluation_sample,
    _page,
    _preparation_report,
    _prepared_document,
)


def _canonical_hash(value: object) -> str:
    return "sha256:" + hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def _prepared() -> PreparedDocument:
    return PreparedDocument.model_validate(_prepared_document())


def _sample() -> OcrEvaluationSample:
    return OcrEvaluationSample.model_validate(_evaluation_sample())


def _staged(prepared: PreparedDocument | None = None) -> StagedPage:
    document = prepared or _prepared()
    page = SourcePageInput.model_validate(_page())
    page_hash = _canonical_hash(
        page.model_dump(mode="json", by_alias=True, exclude_none=False)
    )
    return StagedPage(
        schemaVersion=1,
        canonicalPdfSha256=SHA_0,
        pageInventorySha256=SHA_1,
        processingFingerprint=document.processingFingerprint,
        pageArtifactHash=page_hash,
        page=page,
    )


def _report(data_root: Path, prepared: PreparedDocument) -> PreparationReport:
    payload = _preparation_report()
    paths = staging_paths(
        data_root,
        prepared.metadata.documentId,
        prepared.processingFingerprint,
    )
    payload["processingFingerprint"] = prepared.processingFingerprint
    payload["preparedDocumentHash"] = prepared.preparedDocumentHash
    payload["stageRelativePath"] = paths.preparation_report.relative_to(data_root).as_posix()
    return PreparationReport.model_validate(payload)


def test_staging_paths_follow_the_exact_hash_derived_layout(tmp_path: Path) -> None:
    fingerprint = "sha256:" + "a" * 64
    paths = staging_paths(tmp_path, "madoz-11", fingerprint)
    storage_key = hashlib.sha256(b"madoz-11").hexdigest()
    expected = tmp_path / "staging" / storage_key / ("a" * 64)

    assert paths.directory == expected
    assert paths.source == expected / "source.json"
    assert paths.page(1) == expected / "pages" / "000001.json"
    assert paths.evaluation_sample("sha256:" + "b" * 64) == (
        expected / "evaluation-samples" / f"{'b' * 64}.json"
    )
    assert paths.prepared_document == expected / "prepared-document.json"
    assert paths.preparation_report == expected / "preparation-report.json"


def test_source_snapshot_is_canonical_and_interruption_preserves_previous_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fingerprint = "sha256:" + "a" * 64
    target = write_source_snapshot(
        tmp_path,
        "madoz-11",
        fingerprint,
        {"z": 1, "a": "á"},
    )
    original = target.read_bytes()
    assert original == b'{"a":"\xc3\xa1","z":1}'

    def interrupted_replace(_source: object, _target: object) -> None:
        raise OSError("simulated interruption")

    monkeypatch.setattr("historical_corpus.staging.os.replace", interrupted_replace)
    with pytest.raises(StagingError, match="atomic"):
        write_source_snapshot(
            tmp_path,
            "madoz-11",
            fingerprint,
            {"replacement": True},
        )

    assert target.read_bytes() == original
    assert [item for item in target.parent.iterdir() if item.is_file()] == [target]


def test_staged_page_round_trip_stale_values_and_corruption_are_cache_misses(
    tmp_path: Path,
) -> None:
    staged = _staged()
    write_staged_page(tmp_path, "madoz-11", staged)

    def load(**changes: str) -> StagedPage | None:
        expected = {
            "page_artifact_hash": staged.pageArtifactHash,
            "processing_fingerprint": staged.processingFingerprint,
            "canonical_pdf_sha256": staged.canonicalPdfSha256,
            "page_inventory_sha256": staged.pageInventorySha256,
        }
        expected.update(changes)
        return load_reusable_staged_page(
            tmp_path,
            "madoz-11",
            1,
            **expected,
        )

    assert load() == staged
    for field in (
        "page_artifact_hash",
        "processing_fingerprint",
        "canonical_pdf_sha256",
        "page_inventory_sha256",
    ):
        assert load(**{field: "sha256:" + "f" * 64}) is None

    warnings: list[str] = []
    result = load_reusable_staged_page(
        tmp_path,
        "madoz-11",
        1,
        processing_fingerprint=staged.processingFingerprint,
        canonical_pdf_sha256=staged.canonicalPdfSha256,
        page_inventory_sha256=staged.pageInventorySha256,
    )
    assert result == staged
    assert warnings == []

    page_path = staging_paths(
        tmp_path,
        "madoz-11",
        staged.processingFingerprint,
    ).page(1)
    page_path.write_bytes(b"{not-json")
    result = load_reusable_staged_page(
        tmp_path,
        "madoz-11",
        1,
        processing_fingerprint=staged.processingFingerprint,
        canonical_pdf_sha256=staged.canonicalPdfSha256,
        page_inventory_sha256=staged.pageInventorySha256,
        on_corrupt=warnings.append,
    )
    assert result is None
    assert len(warnings) == 1
    assert warnings[0] != ""

    page_path.write_bytes(b'{"schemaVersion":1')
    assert load() is None


def test_bundle_and_sample_round_trip_and_reject_type_exchange(tmp_path: Path) -> None:
    prepared = _prepared()
    sample = _sample()
    prepared_path = write_prepared_document(tmp_path, prepared)
    sample_path = write_evaluation_sample(tmp_path, sample)

    assert load_prepared_document(
        tmp_path,
        prepared_path.relative_to(tmp_path).as_posix(),
    ) == prepared
    assert load_evaluation_sample(
        tmp_path,
        sample_path.relative_to(tmp_path).as_posix(),
    ) == sample
    with pytest.raises(StagingError):
        load_prepared_document(tmp_path, sample_path.relative_to(tmp_path).as_posix())
    with pytest.raises(StagingError):
        load_evaluation_sample(tmp_path, prepared_path.relative_to(tmp_path).as_posix())


def test_prepared_loader_rejects_unsafe_nonregular_and_oversize_paths(
    tmp_path: Path,
) -> None:
    with pytest.raises(StagingError):
        load_prepared_document(tmp_path, "../prepared-document.json")

    relative = (
        "staging/"
        + "a" * 64
        + "/"
        + "b" * 64
        + "/prepared-document.json"
    )
    target = tmp_path / relative
    target.parent.mkdir(parents=True)
    outside = tmp_path / "outside.json"
    outside.write_bytes(b"{}")
    target.symlink_to(outside)
    with pytest.raises(StagingError, match="symlink"):
        load_prepared_document(tmp_path, relative)

    target.unlink()
    target.mkdir()
    with pytest.raises(StagingError, match="regular"):
        load_prepared_document(tmp_path, relative)

    target.rmdir()
    with target.open("wb") as handle:
        handle.truncate(128 * 1024 * 1024 + 1)
    with pytest.raises(StagingError, match="128 MiB"):
        load_prepared_document(tmp_path, relative)


def test_prepared_loader_runs_cross_validators_for_inventory_tampering(
    tmp_path: Path,
) -> None:
    prepared = _prepared()
    target = write_prepared_document(tmp_path, prepared)
    payload = json.loads(target.read_bytes())
    payload["inventoryRecords"][0]["printedPageLabel"] = "999"
    target.write_bytes(canonical_json_bytes(payload))

    with pytest.raises(StagingError, match="prepared document"):
        load_prepared_document(tmp_path, target.relative_to(tmp_path).as_posix())


def test_write_staged_page_rejects_symlinked_pages_directory(tmp_path: Path) -> None:
    staged = _staged()
    paths = staging_paths(
        tmp_path,
        "madoz-11",
        staged.processingFingerprint,
    )
    outside = tmp_path / "outside"
    outside.mkdir()
    paths.directory.mkdir(parents=True)
    paths.pages.symlink_to(outside)

    with pytest.raises(StagingError, match="symlink"):
        write_staged_page(tmp_path, "madoz-11", staged)

    assert list(outside.iterdir()) == []


def test_top_level_writes_preserve_a_valid_staged_page(tmp_path: Path) -> None:
    prepared = _prepared()
    staged = _staged(prepared)
    page_path = write_staged_page(tmp_path, prepared.metadata.documentId, staged)
    original_page = page_path.read_bytes()

    write_source_snapshot(
        tmp_path,
        prepared.metadata.documentId,
        prepared.processingFingerprint,
        {"schemaVersion": 1, "documentId": prepared.metadata.documentId},
    )
    write_prepared_document(tmp_path, prepared)
    report = _report(tmp_path, prepared)
    report_path = write_preparation_report(tmp_path, report)

    assert page_path.read_bytes() == original_page
    assert report_path == staging_paths(
        tmp_path,
        prepared.metadata.documentId,
        prepared.processingFingerprint,
    ).preparation_report
    assert report_path.read_bytes() == canonical_json_bytes(
        report.model_dump(mode="json", by_alias=True, exclude_none=False)
    )
