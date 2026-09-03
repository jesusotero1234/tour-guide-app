from __future__ import annotations

import contextlib
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import httpx2
import pytest

from historical_corpus import cli
from historical_corpus.evaluation import (
    OcrGateConfig,
    RetrievalGateConfig,
    evaluate_ocr as run_ocr_evaluation,
    evaluate_retrieval as run_retrieval_evaluation,
)
from historical_corpus.locks import CorpusLockError
from historical_corpus.manifest import ManifestValidationError
from historical_corpus.ocr_backend import OcrBackendError
from historical_corpus.pdf_source import PdfSourceError
from historical_corpus.service import (
    DocumentConflictError,
    HistoricalCorpusError,
    IndexRepairRequiredError,
    RightsNotReusableError,
)
from historical_corpus.staging import StagingError
from test_evaluation import EVALUATED_AT, _FakeRetrievalApi, _gold_payload, _retrieval_case_payload
from test_ingest_models import _evaluation_sample, _prepared_document


def _manifest() -> SimpleNamespace:
    return SimpleNamespace(
        document=SimpleNamespace(documentId="madoz-11"),
        prepare_allowed=False,
        publish_allowed=False,
    )


def _json_line(value: str) -> dict[str, object]:
    assert value.endswith("\n")
    assert value.count("\n") == 1
    return json.loads(value)


def test_validate_manifest_does_not_open_source_without_flag(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    manifest = _manifest()
    monkeypatch.setattr(cli, "load_manifest", lambda path: manifest)
    monkeypatch.setattr(
        cli,
        "validate_manifest_source",
        lambda *args: pytest.fail("source must not be opened"),
    )

    code = cli.main(["validate-manifest", "--manifest", "manifest.yml"])

    captured = capsys.readouterr()
    assert code == cli.EXIT_SUCCESS == 0
    assert captured.err == ""
    assert _json_line(captured.out) == {
        "command": "validate-manifest",
        "documentId": "madoz-11",
        "ok": True,
        "prepareAllowed": False,
        "publishAllowed": False,
        "sourceChecked": False,
    }


def test_validate_manifest_check_source_reports_verified_values(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    manifest = _manifest()
    validated = SimpleNamespace(
        pdf_sha256="a" * 64,
        inventory_sha256="b" * 64,
        pdf_page_count=111,
    )
    monkeypatch.setattr(cli, "load_manifest", lambda path: manifest)

    def fake_validate(loaded: object, root: Path) -> object:
        assert loaded is manifest
        assert root == tmp_path / "imports"
        return validated

    monkeypatch.setattr(cli, "validate_manifest_source", fake_validate)

    code = cli.main(
        [
            "validate-manifest",
            "--manifest",
            "manifest.yml",
            "--imports-root",
            str(tmp_path / "imports"),
            "--check-source",
        ]
    )

    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    assert _json_line(captured.out) == {
        "command": "validate-manifest",
        "documentId": "madoz-11",
        "inventorySha256": "sha256:" + "b" * 64,
        "ok": True,
        "pdfPages": 111,
        "pdfSha256": "sha256:" + "a" * 64,
        "prepareAllowed": False,
        "publishAllowed": False,
        "sourceChecked": True,
    }


def _patch_inventory_build(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> tuple[SimpleNamespace, bytes]:
    manifest = _manifest()
    inventory = b'{"row":1}\n{"row":2}\n'
    validated = SimpleNamespace(
        pdf_path=tmp_path / "imports" / "source.pdf",
        inventory_sha256=None,
    )
    records = [
        SimpleNamespace(canonicalStatus="include"),
        SimpleNamespace(canonicalStatus="pending_review"),
    ]
    rendered = object()
    signals = object()
    decided = object()
    monkeypatch.setattr(cli, "load_manifest", lambda path: manifest)
    monkeypatch.setattr(cli, "validate_manifest_source", lambda value, root: validated)
    monkeypatch.setattr(cli, "iter_rendered_leaves", lambda path, value: rendered)

    def fake_signals(value: object, loaded: object) -> object:
        assert value is rendered
        assert loaded is manifest
        return signals

    def fake_apply_decisions(value: object, loaded: object) -> object:
        assert value is signals
        assert loaded is manifest
        return decided

    def fake_finalize(value: object, loaded: object) -> object:
        assert value is decided
        assert loaded is manifest
        return records

    monkeypatch.setattr(cli, "build_inventory_signals", fake_signals)
    monkeypatch.setattr(cli, "apply_duplicate_decisions", fake_apply_decisions)
    monkeypatch.setattr(cli, "finalize_inventory", fake_finalize)
    monkeypatch.setattr(cli, "serialize_inventory_jsonl", lambda value: inventory)
    return manifest, inventory


def test_build_inventory_writes_derived_atomic_jsonl_and_json_result(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    manifest, inventory = _patch_inventory_build(monkeypatch, tmp_path)
    output_root = tmp_path / "inventory-output"

    code = cli.main(
        [
            "build-inventory",
            "--manifest",
            "manifest.yml",
            "--imports-root",
            str(tmp_path / "imports"),
            "--output-root",
            str(output_root),
        ]
    )

    captured = capsys.readouterr()
    storage_key = hashlib.sha256(
        manifest.document.documentId.encode("utf-8")
    ).hexdigest()
    expected_path = output_root / storage_key / "page-inventory.jsonl"
    assert code == 0
    assert captured.err == ""
    assert expected_path.read_bytes() == inventory
    assert _json_line(captured.out) == {
        "command": "build-inventory",
        "documentId": "madoz-11",
        "ok": True,
        "path": str(expected_path),
        "pendingReview": 1,
        "records": 2,
        "sha256": "sha256:" + hashlib.sha256(inventory).hexdigest(),
    }
    assert list(expected_path.parent.iterdir()) == [expected_path]


def test_build_inventory_rejects_symlink_component_without_escape_write(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    manifest, _ = _patch_inventory_build(monkeypatch, tmp_path)
    output_root = tmp_path / "inventory-output"
    output_root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    storage_key = hashlib.sha256(
        manifest.document.documentId.encode("utf-8")
    ).hexdigest()
    (output_root / storage_key).symlink_to(outside, target_is_directory=True)

    code = cli.main(
        [
            "build-inventory",
            "--manifest",
            "manifest.yml",
            "--output-root",
            str(output_root),
        ]
    )

    captured = capsys.readouterr()
    assert code == cli.EXIT_INPUT == 2
    assert captured.out == ""
    error = _json_line(captured.err)
    assert error["ok"] is False
    assert error["error"]["code"] == "INPUT_ERROR"  # type: ignore[index]
    assert not (outside / "page-inventory.jsonl").exists()


def test_help_outputs_single_json_line_on_stdout(
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = cli.main(["--help"])

    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    payload = _json_line(captured.out)
    assert payload["ok"] is True
    assert payload["command"] == "help"
    help_text = payload["help"]  # type: ignore[index]
    assert isinstance(help_text, str)
    assert help_text
    assert "validate-manifest" in help_text
    assert "build-inventory" in help_text


def test_input_errors_are_json_and_exit_codes_are_reserved(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert (
        cli.EXIT_SUCCESS,
        cli.EXIT_INPUT,
        cli.EXIT_RIGHTS,
        cli.EXIT_LOCK,
        cli.EXIT_PROCESSING,
        cli.EXIT_PUBLICATION,
    ) == (0, 2, 3, 4, 5, 6)
    monkeypatch.setattr(
        cli,
        "load_manifest",
        lambda path: (_ for _ in ()).throw(ManifestValidationError("bad manifest")),
    )

    code = cli.main(["validate-manifest", "--manifest", "bad.yml"])

    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""
    assert _json_line(captured.err) == {
        "error": {"code": "INPUT_ERROR", "message": "bad manifest"},
        "ok": False,
    }

    code = cli.main(["unknown-command"])
    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""
    error = _json_line(captured.err)
    assert error["ok"] is False
    assert error["error"]["code"] == "INPUT_ERROR"  # type: ignore[index]


def test_prefetch_models_success_reports_lock_and_model_count(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    manifest = SimpleNamespace(
        document=SimpleNamespace(documentId="madoz-11"),
        processing=SimpleNamespace(modelLockFile="model-lock.json"),
    )
    model_cache_root = tmp_path / "model-cache"
    data_root = tmp_path / "data"
    lock_path = data_root / "locks" / "madoz-prepare.lock"
    model_lock = SimpleNamespace(models=["model-a", "model-b"])

    monkeypatch.setattr(cli, "load_manifest", lambda path: manifest, raising=False)

    received_lock_path: list[Path] = []

    @contextlib.contextmanager
    def fake_exclusive_lock(path: Path) -> object:
        received_lock_path.append(path)
        yield

    monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock, raising=False)

    received_prefetch_args: list[tuple[Path, str]] = []

    def fake_prefetch_models(model_cache_root_arg: Path, lock_relative_path: str) -> SimpleNamespace:
        received_prefetch_args.append((model_cache_root_arg, lock_relative_path))
        return model_lock

    monkeypatch.setattr(cli, "prefetch_models", fake_prefetch_models, raising=False)

    code = cli.main(
        [
            "prefetch-models",
            "--manifest",
            "manifest.yml",
            "--model-cache-root",
            str(model_cache_root),
            "--data-root",
            str(data_root),
        ]
    )

    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    assert received_lock_path == [lock_path]
    assert received_prefetch_args == [(model_cache_root, manifest.processing.modelLockFile)]
    payload = _json_line(captured.out)
    assert payload == {
        "ok": True,
        "command": "prefetch-models",
        "lockPath": str(model_cache_root / "model-lock.json"),
        "modelCount": 2,
    }


def test_prefetch_models_lock_failure_reports_locked(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    manifest = SimpleNamespace(
        document=SimpleNamespace(documentId="madoz-11"),
        processing=SimpleNamespace(modelLockFile="model-lock.json"),
    )
    model_cache_root = tmp_path / "model-cache"
    data_root = tmp_path / "data"
    lock_path = data_root / "locks" / "madoz-prepare.lock"

    monkeypatch.setattr(cli, "load_manifest", lambda path: manifest, raising=False)

    def fake_exclusive_lock(path: Path) -> None:
        raise CorpusLockError(path, "exclusive", "busy")

    monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock, raising=False)

    code = cli.main(
        [
            "prefetch-models",
            "--manifest",
            "manifest.yml",
            "--model-cache-root",
            str(model_cache_root),
            "--data-root",
            str(data_root),
        ]
    )

    captured = capsys.readouterr()
    assert code == 4
    assert captured.out == ""
    error = _json_line(captured.err)
    assert error == {
        "ok": False,
        "error": {"code": "LOCKED", "message": "exclusive lock unavailable for " + str(lock_path) + ": busy"},
    }


def test_prepare_sample_success_reports_sample_and_never_locks(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    imports_root = tmp_path / "imports"
    data_root = tmp_path / "data"
    model_cache_root = tmp_path / "model-cache"
    sample_path = data_root / "samples" / "sample.json"
    fake_sample = SimpleNamespace(
        sampleHash="sha256:" + "c" * 64,
        selectedPages=[SimpleNamespace(), SimpleNamespace()],
    )
    fake_result = SimpleNamespace(
        path=sample_path,
        sample=fake_sample,
        warnings=("warning-a", "warning-b"),
    )

    received_manifest: list[object] = []
    received_refs: list[object] = []
    received_kwargs: list[dict[str, object]] = []

    def fake_prepare_evaluation_sample(
        manifest_path: object,
        refs: object,
        *,
        imports_root: object,
        data_root: object,
        model_cache_root: object,
    ) -> object:
        received_manifest.append(manifest_path)
        received_refs.append(refs)
        received_kwargs.append(
            {
                "imports_root": imports_root,
                "data_root": data_root,
                "model_cache_root": model_cache_root,
            }
        )
        return fake_result

    monkeypatch.setattr(
        cli,
        "prepare_evaluation_sample",
        fake_prepare_evaluation_sample,
        raising=False,
    )

    lock_calls: list[Path] = []

    @contextlib.contextmanager
    def fake_exclusive_lock(path: Path) -> object:
        lock_calls.append(path)
        yield

    monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock, raising=False)

    code = cli.main(
        [
            "prepare-sample",
            "--manifest",
            "manifest.yml",
            "--pages",
            "12:left,13:right",
            "--imports-root",
            str(imports_root),
            "--data-root",
            str(data_root),
            "--model-cache-root",
            str(model_cache_root),
        ]
    )

    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    assert received_manifest == [Path("manifest.yml")]
    assert received_refs == [((12, "left"), (13, "right"))]
    assert received_kwargs == [
        {
            "imports_root": imports_root,
            "data_root": data_root,
            "model_cache_root": model_cache_root,
        }
    ]
    assert lock_calls == []
    payload = _json_line(captured.out)
    assert payload == {
        "ok": True,
        "command": "prepare-sample",
        "path": str(sample_path),
        "sampleHash": "sha256:" + "c" * 64,
        "pageCount": 2,
        "warnings": ["warning-a", "warning-b"],
        "publishable": False,
    }


def test_prepare_sample_malformed_pages_reports_input_error(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        cli,
        "prepare_evaluation_sample",
        lambda *args, **kwargs: pytest.fail("must not be called"),
        raising=False,
    )

    for ref in ("12:up", "²:full"):
        code = cli.main(
            [
                "prepare-sample",
                "--manifest",
                "manifest.yml",
                "--pages",
                ref,
                "--imports-root",
                "/imports",
                "--data-root",
                "/data",
                "--model-cache-root",
                "/model-cache",
            ]
        )

        captured = capsys.readouterr()
        assert code == 2
        assert captured.out == ""
        error = _json_line(captured.err)
        assert error == {
            "ok": False,
            "error": {"code": "INPUT_ERROR", "message": f"invalid page reference '{ref}'"},
        }


def test_prepare_success_reports_deterministic_result_and_never_locks(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    imports_root = tmp_path / "imports"
    data_root = tmp_path / "data"
    model_cache_root = tmp_path / "model-cache"
    source_path = data_root / "source.json"
    prepared_document_path = data_root / "prepared.json"
    report_path = data_root / "report.json"
    fake_prepared_document = SimpleNamespace(
        preparedDocumentHash="sha256:" + "d" * 64,
    )
    fake_report = SimpleNamespace(
        model_dump=lambda mode, by_alias, exclude_none: {
            "documentId": "madoz-11",
            "preparedDocumentHash": "sha256:" + "d" * 64,
        },
    )
    fake_result = SimpleNamespace(
        source_path=source_path,
        prepared_document_path=prepared_document_path,
        report_path=report_path,
        warnings=("warning-x",),
        prepared_document=fake_prepared_document,
        report=fake_report,
    )

    received_manifest: list[object] = []
    received_kwargs: list[dict[str, object]] = []

    def fake_prepare_document(
        manifest_path: object,
        *,
        imports_root: object,
        data_root: object,
        model_cache_root: object,
    ) -> object:
        received_manifest.append(manifest_path)
        received_kwargs.append(
            {
                "imports_root": imports_root,
                "data_root": data_root,
                "model_cache_root": model_cache_root,
            }
        )
        return fake_result

    monkeypatch.setattr(
        cli,
        "prepare_document",
        fake_prepare_document,
        raising=False,
    )

    lock_calls: list[Path] = []

    @contextlib.contextmanager
    def fake_exclusive_lock(path: Path) -> object:
        lock_calls.append(path)
        yield

    monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock, raising=False)

    prefetch_calls: list[object] = []

    def fake_prefetch_models(*args: object, **kwargs: object) -> object:
        prefetch_calls.append((args, kwargs))
        return SimpleNamespace(models=[])

    monkeypatch.setattr(cli, "prefetch_models", fake_prefetch_models, raising=False)

    args = [
        "prepare",
        "--manifest",
        "manifest.yml",
        "--imports-root",
        str(imports_root),
        "--data-root",
        str(data_root),
        "--model-cache-root",
        str(model_cache_root),
    ]

    code = cli.main(args)
    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    payload = _json_line(captured.out)
    expected_payload = {
        "ok": True,
        "command": "prepare",
        "sourcePath": str(source_path),
        "preparedDocumentPath": str(prepared_document_path),
        "reportPath": str(report_path),
        "preparedDocumentHash": "sha256:" + "d" * 64,
        "report": {
            "documentId": "madoz-11",
            "preparedDocumentHash": "sha256:" + "d" * 64,
        },
        "warnings": ["warning-x"],
    }
    assert payload == expected_payload

    code = cli.main(args)
    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    assert _json_line(captured.out) == expected_payload

    assert received_manifest == [Path("manifest.yml"), Path("manifest.yml")]
    assert received_kwargs == [
        {
            "imports_root": imports_root,
            "data_root": data_root,
            "model_cache_root": model_cache_root,
        },
        {
            "imports_root": imports_root,
            "data_root": data_root,
            "model_cache_root": model_cache_root,
        },
    ]
    assert lock_calls == []
    assert prefetch_calls == []


def test_ocr_smoke_success_reports_single_leaf_and_never_prepares(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    imports_root = tmp_path / "imports"
    data_root = tmp_path / "data"
    model_cache_root = tmp_path / "model-cache"
    inventory_path = imports_root / "page-inventory.jsonl"
    inventory_path.parent.mkdir(parents=True)
    inventory_path.write_text('{"pdfPage":12,"side":"left","canonicalStatus":"include"}\n', encoding="utf-8")

    manifest = SimpleNamespace(
        document=SimpleNamespace(documentId="madoz-11"),
        processing=SimpleNamespace(modelLockFile="model-lock.json"),
    )
    validated = SimpleNamespace(inventory_path=inventory_path)
    record = SimpleNamespace(pdfPage=12, side="left", canonicalStatus="include")
    canonical = SimpleNamespace(path=data_root / "raw" / "canonical.pdf", sha256="sha256:" + "e" * 64)
    fake_processor = SimpleNamespace(
        process_page=lambda rec: SimpleNamespace(
            pageId="page-12-left",
            documentId="madoz-11",
            logicalPageNumber=12,
            sourcePdfPageNumber=12,
            leafSide="left",
            lines=["line-a", "line-b"],
            qualityFlags=("flag-a",),
            meanConfidence=0.91,
        ),
        close=lambda: None,
    )
    received_process_page: list[object] = []

    def fake_process_page(rec: object) -> object:
        received_process_page.append(rec)
        return SimpleNamespace(
            pageId="page-12-left",
            documentId="madoz-11",
            logicalPageNumber=12,
            sourcePdfPageNumber=12,
            leafSide="left",
            lines=["line-a", "line-b"],
            qualityFlags=("flag-a",),
            meanConfidence=0.91,
        )

    fake_processor.process_page = fake_process_page

    received_load_verified_inventory: list[tuple[bytes, object]] = []

    def fake_load_verified_inventory(payload: bytes, manifest_arg: object) -> list[object]:
        received_load_verified_inventory.append((payload, manifest_arg))
        assert payload == inventory_path.read_bytes()
        assert manifest_arg is manifest
        return [record]

    received_open_processor: list[tuple[object, object, object]] = []

    @contextlib.contextmanager
    def fake_open_processor(manifest_arg: object, canonical_arg: object, model_cache_root_arg: object) -> object:
        received_open_processor.append((manifest_arg, canonical_arg, model_cache_root_arg))
        yield fake_processor

    monkeypatch.setattr(cli, "load_manifest", lambda path: manifest, raising=False)
    monkeypatch.setattr(cli, "validate_manifest_source", lambda value, root: validated, raising=False)
    monkeypatch.setattr(cli, "load_verified_inventory", fake_load_verified_inventory, raising=False)
    monkeypatch.setattr(cli, "prepare_source", lambda manifest, imports, data: canonical, raising=False)
    model_lock = SimpleNamespace(models=[])
    received_load_model_lock: list[tuple[object, object]] = []

    def fake_load_model_lock(root: object, path: object) -> object:
        received_load_model_lock.append((root, path))
        return model_lock

    received_verify_model_lock: list[tuple[object, object]] = []

    def fake_verify_model_lock(root: object, lock: object) -> object:
        received_verify_model_lock.append((root, lock))
        return {}

    monkeypatch.setattr(cli, "load_model_lock", fake_load_model_lock, raising=False)
    monkeypatch.setattr(cli, "verify_model_lock", fake_verify_model_lock, raising=False)
    monkeypatch.setattr(cli, "open_processor", fake_open_processor, raising=False)

    lock_calls: list[Path] = []

    @contextlib.contextmanager
    def fake_exclusive_lock(path: Path) -> object:
        lock_calls.append(path)
        yield

    monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock, raising=False)

    prefetch_calls: list[object] = []
    monkeypatch.setattr(
        cli, "prefetch_models", lambda *args, **kwargs: prefetch_calls.append((args, kwargs)), raising=False
    )
    prepare_document_calls: list[object] = []
    monkeypatch.setattr(
        cli, "prepare_document", lambda *args, **kwargs: prepare_document_calls.append((args, kwargs)), raising=False
    )
    prepare_sample_calls: list[object] = []
    monkeypatch.setattr(
        cli, "prepare_evaluation_sample", lambda *args, **kwargs: prepare_sample_calls.append((args, kwargs)), raising=False
    )

    code = cli.main(
        [
            "ocr-smoke",
            "--manifest",
            "manifest.yml",
            "--pdf-page",
            "12",
            "--side",
            "left",
            "--imports-root",
            str(imports_root),
            "--data-root",
            str(data_root),
            "--model-cache-root",
            str(model_cache_root),
        ]
    )

    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    assert lock_calls == [data_root / "locks" / "madoz-prepare.lock"]
    assert prefetch_calls == []
    assert prepare_document_calls == []
    assert prepare_sample_calls == []
    assert received_open_processor == [(manifest, canonical, model_cache_root)]
    assert received_process_page == [record]
    assert received_load_model_lock == [(model_cache_root, manifest.processing.modelLockFile)]
    assert received_verify_model_lock == [(model_cache_root, model_lock)]
    payload = _json_line(captured.out)
    assert payload == {
        "ok": True,
        "command": "ocr-smoke",
        "documentId": "madoz-11",
        "pageId": "page-12-left",
        "logicalPageNumber": 12,
        "pdfPage": 12,
        "side": "left",
        "lineCount": 2,
        "qualityFlags": ["flag-a"],
        "meanConfidence": 0.91,
    }


def _publishable_prepared() -> SimpleNamespace:
    return SimpleNamespace(
        metadata=SimpleNamespace(
            documentId="madoz-11",
            canonicalPdfSha256="sha256:" + "f" * 64,
            rights=SimpleNamespace(isExplicitlyReusable=True),
            sourceIsExactRecord=True,
        ),
        publicationGate=SimpleNamespace(
            sourceIsExactRecord=True,
            coverage=SimpleNamespace(acceptedForProduct=True),
        ),
        canonicalPdfRelativePath="raw/" + hashlib.sha256("madoz-11".encode("utf-8")).hexdigest() + "/" + "f" * 64 + ".pdf",
    )


def test_publish_precondition_gates_report_correct_exit_and_code(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root = tmp_path / "data"
    rel_path = "staging/doc/fingerprint/prepared-document.json"

    cases = [
        (
            "rights",
            SimpleNamespace(
                metadata=SimpleNamespace(
                    documentId="madoz-11",
                    canonicalPdfSha256="sha256:" + "f" * 64,
                    rights=SimpleNamespace(isExplicitlyReusable=False),
                    sourceIsExactRecord=True,
                ),
                publicationGate=SimpleNamespace(
                    sourceIsExactRecord=True,
                    coverage=SimpleNamespace(acceptedForProduct=True),
                ),
                canonicalPdfRelativePath=rel_path,
            ),
            3,
            "REUSE_RIGHTS_NOT_VERIFIED",
            "source reuse rights are not explicitly verified",
        ),
        (
            "metadata_source_exact",
            SimpleNamespace(
                metadata=SimpleNamespace(
                    documentId="madoz-11",
                    canonicalPdfSha256="sha256:" + "f" * 64,
                    rights=SimpleNamespace(isExplicitlyReusable=True),
                    sourceIsExactRecord=False,
                ),
                publicationGate=SimpleNamespace(
                    sourceIsExactRecord=True,
                    coverage=SimpleNamespace(acceptedForProduct=True),
                ),
                canonicalPdfRelativePath=rel_path,
            ),
            6,
            "PUBLICATION_BLOCKED",
            "source is not an exact record",
        ),
        (
            "gate_source_exact",
            SimpleNamespace(
                metadata=SimpleNamespace(
                    documentId="madoz-11",
                    canonicalPdfSha256="sha256:" + "f" * 64,
                    rights=SimpleNamespace(isExplicitlyReusable=True),
                    sourceIsExactRecord=True,
                ),
                publicationGate=SimpleNamespace(
                    sourceIsExactRecord=False,
                    coverage=SimpleNamespace(acceptedForProduct=True),
                ),
                canonicalPdfRelativePath=rel_path,
            ),
            6,
            "PUBLICATION_BLOCKED",
            "source is not an exact record",
        ),
        (
            "coverage_accepted",
            SimpleNamespace(
                metadata=SimpleNamespace(
                    documentId="madoz-11",
                    canonicalPdfSha256="sha256:" + "f" * 64,
                    rights=SimpleNamespace(isExplicitlyReusable=True),
                    sourceIsExactRecord=True,
                ),
                publicationGate=SimpleNamespace(
                    sourceIsExactRecord=True,
                    coverage=SimpleNamespace(acceptedForProduct=False),
                ),
                canonicalPdfRelativePath=rel_path,
            ),
            6,
            "PUBLICATION_BLOCKED",
            "coverage has not been accepted for product",
        ),
    ]

    for name, prepared, expected_code, expected_err_code, expected_message in cases:
        capsys.readouterr()
        received_load_args: list[tuple[Path, str]] = []

        def fake_load_prepared_document(root: Path, rel: str) -> object:
            received_load_args.append((root, rel))
            return prepared

        monkeypatch.setattr(cli, "load_prepared_document", fake_load_prepared_document, raising=False)
        monkeypatch.setattr(cli, "build_service_from_env", lambda *a, **k: pytest.fail("must not be called"), raising=False)
        monkeypatch.setattr(cli, "verify_pdf_sha256", lambda *a, **k: pytest.fail("must not be called"), raising=False)
        monkeypatch.setattr(cli, "exclusive_lock", lambda *a, **k: pytest.fail("must not be called"), raising=False)

        code = cli.main(
            [
                "publish",
                "--prepared",
                rel_path,
                "--data-root",
                str(data_root),
            ]
        )

        captured = capsys.readouterr()
        assert code == expected_code
        assert captured.out == ""
        error = _json_line(captured.err)
        assert error == {
            "ok": False,
            "error": {"code": expected_err_code, "message": expected_message},
        }
        assert received_load_args == [(data_root, rel_path)]


def test_publish_rejects_invalid_prepared_document(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root = tmp_path / "data"
    rel_path = "staging/doc/fingerprint/prepared-document.json"

    def fake_load_prepared_document(root: Path, rel: str) -> object:
        raise StagingError("prepared document is invalid")

    monkeypatch.setattr(cli, "load_prepared_document", fake_load_prepared_document, raising=False)
    monkeypatch.setattr(cli, "build_service_from_env", lambda *a, **k: pytest.fail("must not be called"), raising=False)

    code = cli.main(
        [
            "publish",
            "--prepared",
            rel_path,
            "--data-root",
            str(data_root),
        ]
    )

    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""
    error = _json_line(captured.err)
    assert error == {
        "ok": False,
        "error": {"code": "INPUT_ERROR", "message": "prepared document is invalid"},
    }


def test_publish_live_api_lock_reports_locked(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root = tmp_path / "data"
    rel_path = "staging/doc/fingerprint/prepared-document.json"
    prepared = _publishable_prepared()
    lock_path = data_root / "locks" / "corpus.lock"

    received_load_args: list[tuple[Path, str]] = []

    def fake_load_prepared_document(root: Path, rel: str) -> object:
        received_load_args.append((root, rel))
        return prepared

    monkeypatch.setattr(cli, "load_prepared_document", fake_load_prepared_document, raising=False)

    def fake_exclusive_lock(path: Path) -> None:
        raise CorpusLockError(path, "exclusive", "busy")

    monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock, raising=False)
    monkeypatch.setattr(cli, "verify_pdf_sha256", lambda *a, **k: pytest.fail("must not be called"), raising=False)
    monkeypatch.setattr(cli, "build_service_from_env", lambda *a, **k: pytest.fail("must not be called"), raising=False)

    code = cli.main(
        [
            "publish",
            "--prepared",
            rel_path,
            "--data-root",
            str(data_root),
        ]
    )

    captured = capsys.readouterr()
    assert code == 4
    assert captured.out == ""
    error = _json_line(captured.err)
    assert error == {
        "ok": False,
        "error": {"code": "LOCKED", "message": "exclusive lock unavailable for " + str(lock_path) + ": busy"},
    }
    assert received_load_args == [(data_root, rel_path)]


def test_ocr_smoke_model_lock_failure_reports_processing_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    imports_root = tmp_path / "imports"
    data_root = tmp_path / "data"
    model_cache_root = tmp_path / "model-cache"
    inventory_path = imports_root / "page-inventory.jsonl"
    inventory_path.parent.mkdir(parents=True)
    inventory_path.write_text('{"pdfPage":12,"side":"left","canonicalStatus":"include"}\n', encoding="utf-8")

    manifest = SimpleNamespace(
        document=SimpleNamespace(documentId="madoz-11"),
        processing=SimpleNamespace(modelLockFile="model-lock.json"),
    )
    validated = SimpleNamespace(inventory_path=inventory_path)
    record = SimpleNamespace(pdfPage=12, side="left", canonicalStatus="include")
    canonical = SimpleNamespace(path=data_root / "raw" / "canonical.pdf", sha256="sha256:" + "e" * 64)

    received_load_verified_inventory: list[tuple[bytes, object]] = []

    def fake_load_verified_inventory(payload: bytes, manifest_arg: object) -> list[object]:
        received_load_verified_inventory.append((payload, manifest_arg))
        assert payload == inventory_path.read_bytes()
        assert manifest_arg is manifest
        return [record]

    monkeypatch.setattr(cli, "load_manifest", lambda path: manifest, raising=False)
    monkeypatch.setattr(cli, "validate_manifest_source", lambda value, root: validated, raising=False)
    monkeypatch.setattr(cli, "load_verified_inventory", fake_load_verified_inventory, raising=False)
    monkeypatch.setattr(cli, "prepare_source", lambda manifest, imports, data: canonical, raising=False)
    monkeypatch.setattr(
        cli, "load_model_lock", lambda root, path: (_ for _ in ()).throw(OcrBackendError("broken model lock")), raising=False
    )

    lock_calls: list[Path] = []

    @contextlib.contextmanager
    def fake_exclusive_lock(path: Path) -> object:
        lock_calls.append(path)
        yield

    monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock, raising=False)

    code = cli.main(
        [
            "ocr-smoke",
            "--manifest",
            "manifest.yml",
            "--pdf-page",
            "12",
            "--side",
            "left",
            "--imports-root",
            str(imports_root),
            "--data-root",
            str(data_root),
            "--model-cache-root",
            str(model_cache_root),
        ]
    )

    captured = capsys.readouterr()
    assert code == 5
    assert captured.out == ""
    assert lock_calls == [data_root / "locks" / "madoz-prepare.lock"]
    error = _json_line(captured.err)
    assert error == {
        "ok": False,
        "error": {"code": "PROCESSING_ERROR", "message": "broken model lock"},
    }


def test_publish_rejects_prepared_paths_outside_data_root_staging(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root = tmp_path / "data"
    bad_paths = [
        "../prepared-document.json",
        "other/prepared-document.json",
        "staging/../prepared-document.json",
        str(tmp_path / "outside" / "prepared-document.json"),
    ]

    for bad_path in bad_paths:
        capsys.readouterr()
        monkeypatch.setattr(
            cli, "load_prepared_document", lambda *a, **k: pytest.fail("must not be called"), raising=False
        )
        monkeypatch.setattr(
            cli, "verify_pdf_sha256", lambda *a, **k: pytest.fail("must not be called"), raising=False
        )
        monkeypatch.setattr(
            cli, "exclusive_lock", lambda *a, **k: pytest.fail("must not be called"), raising=False
        )
        monkeypatch.setattr(
            cli, "build_service_from_env", lambda *a, **k: pytest.fail("must not be called"), raising=False
        )

        code = cli.main(
            [
                "publish",
                "--prepared",
                bad_path,
                "--data-root",
                str(data_root),
            ]
        )

        captured = capsys.readouterr()
        assert code == 2
        assert captured.out == ""
        error = _json_line(captured.err)
        assert error["ok"] is False
        assert error["error"]["code"] == "INPUT_ERROR"  # type: ignore[index]
        assert error["error"]["message"]  # type: ignore[index]


def test_publish_service_errors_map_to_reserved_codes_and_events(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root = tmp_path / "data"
    rel_path = "staging/doc/fingerprint/prepared-document.json"
    prepared = _publishable_prepared()
    lock_path = data_root / "locks" / "corpus.lock"
    canonical_path = data_root / prepared.canonicalPdfRelativePath
    declared_sha = prepared.metadata.canonicalPdfSha256

    cases = [
        (RightsNotReusableError("rights failed"), 3, "REUSE_RIGHTS_NOT_VERIFIED"),
        (DocumentConflictError("conflict"), 6, "DOCUMENT_CONFLICT"),
        (IndexRepairRequiredError("repair required"), 5, "INDEX_REPAIR_REQUIRED"),
        (HistoricalCorpusError("service failed"), 5, "HISTORICAL_CORPUS_ERROR"),
    ]

    for error, expected_code, expected_err_code in cases:
        capsys.readouterr()
        events: list[str] = []
        received_lock_paths: list[Path] = []
        received_load_args: list[tuple[Path, str]] = []
        received_verify_args: list[tuple[Path, str]] = []

        class FakeService:
            def __enter__(self) -> "FakeService":
                events.append("service_enter")
                return self

            def __exit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
                events.append("service_exit")

            def ingest_prepared(self, prepared_arg: object) -> None:
                events.append("ingest_prepared")
                raise error

        @contextlib.contextmanager
        def fake_exclusive_lock(path: Path) -> object:
            received_lock_paths.append(path)
            events.append("lock_enter")
            try:
                yield
            finally:
                events.append("lock_exit")

        monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock, raising=False)

        def fake_load_prepared_document(root: Path, rel: str) -> object:
            received_load_args.append((root, rel))
            return prepared

        monkeypatch.setattr(cli, "load_prepared_document", fake_load_prepared_document, raising=False)

        def fake_verify_pdf_sha256(path: Path, sha: str) -> None:
            events.append("verify_pdf_sha256")
            received_verify_args.append((path, sha))

        monkeypatch.setattr(cli, "verify_pdf_sha256", fake_verify_pdf_sha256, raising=False)

        def fake_build_service_from_env(*args: object, **kwargs: object) -> FakeService:
            events.append("build_service")
            return FakeService()

        monkeypatch.setattr(cli, "build_service_from_env", fake_build_service_from_env, raising=False)

        code = cli.main(
            [
                "publish",
                "--prepared",
                rel_path,
                "--data-root",
                str(data_root),
            ]
        )

        captured = capsys.readouterr()
        assert code == expected_code
        assert captured.out == ""
        error_payload = _json_line(captured.err)
        assert error_payload == {
            "ok": False,
            "error": {"code": expected_err_code, "message": str(error)},
        }
        assert events == [
            "lock_enter",
            "verify_pdf_sha256",
            "build_service",
            "service_enter",
            "ingest_prepared",
            "service_exit",
            "lock_exit",
        ]
        assert received_lock_paths == [lock_path]
        assert received_load_args == [(data_root, rel_path)]
        assert received_verify_args == [(canonical_path, declared_sha)]


def test_publish_processing_errors_report_exit_5_and_cleanup(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root = tmp_path / "data"
    rel_path = "staging/doc/fingerprint/prepared-document.json"
    prepared = _publishable_prepared()
    lock_path = data_root / "locks" / "corpus.lock"
    canonical_path = data_root / prepared.canonicalPdfRelativePath
    declared_sha = prepared.metadata.canonicalPdfSha256

    cases = [
        (
            "pdf_source",
            PdfSourceError("bad canonical PDF"),
            "verify_pdf_sha256",
        ),
        (
            "runtime_config",
            ValueError("bad runtime config"),
            "build_service_from_env",
        ),
        (
            "runtime_storage",
            OSError("runtime storage unavailable"),
            "build_service_from_env",
        ),
    ]

    for name, error, failing_fn in cases:
        capsys.readouterr()
        events: list[str] = []
        received_lock_paths: list[Path] = []
        received_load_args: list[tuple[Path, str]] = []
        received_verify_args: list[tuple[Path, str]] = []

        @contextlib.contextmanager
        def fake_exclusive_lock(path: Path) -> object:
            received_lock_paths.append(path)
            events.append("lock_enter")
            try:
                yield
            finally:
                events.append("lock_exit")

        monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock, raising=False)

        def fake_load_prepared_document(root: Path, rel: str) -> object:
            received_load_args.append((root, rel))
            return prepared

        monkeypatch.setattr(cli, "load_prepared_document", fake_load_prepared_document, raising=False)

        def fake_verify_pdf_sha256(path: Path, sha: str) -> None:
            events.append("verify_pdf_sha256")
            received_verify_args.append((path, sha))
            if failing_fn == "verify_pdf_sha256":
                raise error

        monkeypatch.setattr(cli, "verify_pdf_sha256", fake_verify_pdf_sha256, raising=False)

        def fake_build_service_from_env(*args: object, **kwargs: object) -> object:
            events.append("build_service")
            if failing_fn == "build_service_from_env":
                raise error
            return object()

        monkeypatch.setattr(cli, "build_service_from_env", fake_build_service_from_env, raising=False)

        code = cli.main(
            [
                "publish",
                "--prepared",
                rel_path,
                "--data-root",
                str(data_root),
            ]
        )

        captured = capsys.readouterr()
        assert code == 5
        assert captured.out == ""
        error_payload = _json_line(captured.err)
        assert error_payload == {
            "ok": False,
            "error": {"code": "PROCESSING_ERROR", "message": str(error)},
        }
        assert received_lock_paths == [lock_path]
        assert received_load_args == [(data_root, rel_path)]
        if failing_fn == "verify_pdf_sha256":
            assert events == ["lock_enter", "verify_pdf_sha256", "lock_exit"]
            assert received_verify_args == [(canonical_path, declared_sha)]
        else:
            assert events == ["lock_enter", "verify_pdf_sha256", "build_service", "lock_exit"]
            assert received_verify_args == [(canonical_path, declared_sha)]


def test_publish_success_and_idempotent_replay(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root = tmp_path / "data"
    rel_path = "staging/doc/fingerprint/prepared-document.json"
    prepared = _publishable_prepared()
    lock_path = data_root / "locks" / "corpus.lock"
    canonical_path = data_root / prepared.canonicalPdfRelativePath
    declared_sha = prepared.metadata.canonicalPdfSha256

    events: list[str] = []
    received_lock_paths: list[Path] = []
    received_load_args: list[tuple[Path, str]] = []
    received_verify_args: list[tuple[Path, str]] = []
    received_service_args: list[tuple[tuple[object, ...], dict[str, object]]] = []
    received_ingest_args: list[object] = []

    class FakeService:
        def __enter__(self) -> "FakeService":
            events.append("service_enter")
            return self

        def __exit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
            events.append("service_exit")

        def ingest_prepared(self, prepared_arg: object) -> SimpleNamespace:
            events.append("ingest_prepared")
            received_ingest_args.append(prepared_arg)
            return SimpleNamespace(
                documentId="madoz-11",
                chunkIds=["chunk-a", "chunk-b"],
            )

    @contextlib.contextmanager
    def fake_exclusive_lock(path: Path) -> object:
        received_lock_paths.append(path)
        events.append("lock_enter")
        yield
        events.append("lock_exit")

    monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock, raising=False)

    def fake_load_prepared_document(root: Path, rel: str) -> object:
        received_load_args.append((root, rel))
        return prepared

    monkeypatch.setattr(cli, "load_prepared_document", fake_load_prepared_document, raising=False)

    def fake_verify_pdf_sha256(path: Path, sha: str) -> None:
        events.append("verify_pdf_sha256")
        received_verify_args.append((path, sha))

    monkeypatch.setattr(cli, "verify_pdf_sha256", fake_verify_pdf_sha256, raising=False)

    def fake_build_service_from_env(*args: object, **kwargs: object) -> FakeService:
        events.append("build_service")
        received_service_args.append((args, kwargs))
        return FakeService()

    monkeypatch.setattr(cli, "build_service_from_env", fake_build_service_from_env, raising=False)

    expected_payload = {
        "ok": True,
        "command": "publish",
        "documentId": "madoz-11",
        "chunkIds": ["chunk-a", "chunk-b"],
        "chunkCount": 2,
    }

    expected_events = [
        "lock_enter",
        "verify_pdf_sha256",
        "build_service",
        "service_enter",
        "ingest_prepared",
        "service_exit",
        "lock_exit",
    ]

    # First run: relative staging path
    events.clear()
    received_lock_paths.clear()
    received_load_args.clear()
    received_verify_args.clear()
    received_service_args.clear()
    received_ingest_args.clear()

    code = cli.main(
        [
            "publish",
            "--prepared",
            rel_path,
            "--data-root",
            str(data_root),
        ]
    )

    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    assert _json_line(captured.out) == expected_payload
    assert events == expected_events
    assert received_lock_paths == [lock_path]
    assert received_load_args == [(data_root, rel_path)]
    assert received_verify_args == [(canonical_path, declared_sha)]
    assert received_service_args == [((), {"startup_policy": "repair"})]
    assert received_ingest_args == [prepared]

    # Second run: equivalent absolute path beneath data_root
    abs_path = data_root / rel_path
    events.clear()
    received_lock_paths.clear()
    received_load_args.clear()
    received_verify_args.clear()
    received_service_args.clear()
    received_ingest_args.clear()

    code = cli.main(
        [
            "publish",
            "--prepared",
            str(abs_path),
            "--data-root",
            str(data_root),
        ]
    )

    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    assert _json_line(captured.out) == expected_payload
    assert events == expected_events
    assert received_lock_paths == [lock_path]
    assert received_load_args == [(data_root, rel_path)]
    assert received_verify_args == [(canonical_path, declared_sha)]
    assert received_service_args == [((), {"startup_policy": "repair"})]
    assert received_ingest_args == [prepared]


def _repair_index_version() -> SimpleNamespace:
    return SimpleNamespace(
        generation=5,
        indexVersion="index-v5",
        corpusIndexVersion="corpus-v5",
        documentCount=2,
        chunkCount=7,
    )


@pytest.mark.parametrize(
    "repair_scenario",
    ["journal-after-crash", "missing-vector-id", "extra-vector-id"],
)
def test_repair_index_reports_repaired_state_for_repairable_divergence(
    repair_scenario: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root = tmp_path / "data"
    lock_path = data_root / "locks" / "corpus.lock"
    events: list[str] = []
    received_lock_paths: list[Path] = []
    received_service_args: list[tuple[tuple[object, ...], dict[str, object]]] = []

    class FakeService:
        def __enter__(self) -> "FakeService":
            events.append("service_enter")
            return self

        def __exit__(self, *args: object) -> None:
            events.append("service_exit")

        def index_version(self) -> SimpleNamespace:
            events.append("index_version")
            return _repair_index_version()

    @contextlib.contextmanager
    def fake_exclusive_lock(path: Path):
        received_lock_paths.append(path)
        events.append("lock_enter")
        try:
            yield
        finally:
            events.append("lock_exit")

    def fake_read_index_generation(path: Path) -> int:
        assert repair_scenario in {
            "journal-after-crash",
            "missing-vector-id",
            "extra-vector-id",
        }
        assert path == data_root / "corpus.sqlite3"
        events.append("read_generation")
        return 4

    def fake_build_service(*args: object, **kwargs: object) -> FakeService:
        received_service_args.append((args, kwargs))
        events.append("build_service")
        return FakeService()

    monkeypatch.setenv("HISTORICAL_CORPUS_DATA_DIR", str(data_root))
    monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock)
    monkeypatch.setattr(cli, "_read_index_generation", fake_read_index_generation, raising=False)
    monkeypatch.setattr(cli, "build_service_from_env", fake_build_service)

    code = cli.main(["repair-index"])

    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    assert _json_line(captured.out) == {
        "ok": True,
        "command": "repair-index",
        "repaired": True,
        "generation": 5,
        "indexVersion": "index-v5",
        "corpusIndexVersion": "corpus-v5",
        "documentCount": 2,
        "chunkCount": 7,
    }
    assert received_lock_paths == [lock_path]
    assert received_service_args == [((), {"startup_policy": "repair"})]
    assert events == [
        "lock_enter",
        "read_generation",
        "build_service",
        "service_enter",
        "index_version",
        "service_exit",
        "lock_exit",
    ]


def test_repair_index_healthy_state_is_a_noop(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root = tmp_path / "data"
    events: list[str] = []

    class FakeService:
        def __enter__(self) -> "FakeService":
            events.append("service_enter")
            return self

        def __exit__(self, *args: object) -> None:
            events.append("service_exit")

        def index_version(self) -> SimpleNamespace:
            events.append("index_version")
            return _repair_index_version()

    @contextlib.contextmanager
    def fake_exclusive_lock(path: Path):
        assert path == data_root / "locks" / "corpus.lock"
        events.append("lock_enter")
        try:
            yield
        finally:
            events.append("lock_exit")

    monkeypatch.setenv("HISTORICAL_CORPUS_DATA_DIR", str(data_root))
    monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock)
    monkeypatch.setattr(cli, "_read_index_generation", lambda path: 5, raising=False)
    monkeypatch.setattr(
        cli,
        "build_service_from_env",
        lambda *args, **kwargs: FakeService()
        if (args, kwargs) == ((), {"startup_policy": "repair"})
        else pytest.fail("unexpected service arguments"),
    )

    code = cli.main(["repair-index"])

    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    assert _json_line(captured.out) == {
        "ok": True,
        "command": "repair-index",
        "repaired": False,
        "generation": 5,
        "indexVersion": "index-v5",
        "corpusIndexVersion": "corpus-v5",
        "documentCount": 2,
        "chunkCount": 7,
    }
    assert events == [
        "lock_enter",
        "service_enter",
        "index_version",
        "service_exit",
        "lock_exit",
    ]


def test_repair_index_live_api_lock_failure_does_not_load_models(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root = tmp_path / "data"
    lock_path = data_root / "locks" / "corpus.lock"

    def fake_exclusive_lock(path: Path) -> None:
        assert path == lock_path
        raise CorpusLockError(path, "exclusive", "busy")

    monkeypatch.setenv("HISTORICAL_CORPUS_DATA_DIR", str(data_root))
    monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock)
    monkeypatch.setattr(
        cli,
        "_read_index_generation",
        lambda path: pytest.fail("must not read SQLite while API lock is held"),
        raising=False,
    )
    monkeypatch.setattr(
        cli,
        "build_service_from_env",
        lambda *args, **kwargs: pytest.fail("must not load models while API lock is held"),
    )

    code = cli.main(["repair-index"])

    captured = capsys.readouterr()
    assert code == 4
    assert captured.out == ""
    assert _json_line(captured.err)["error"]["code"] == "LOCKED"


def test_repair_index_error_can_be_retried_after_lock_cleanup(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root = tmp_path / "data"
    events: list[str] = []
    attempts = 0

    class FakeService:
        def __enter__(self) -> "FakeService":
            return self

        def __exit__(self, *args: object) -> None:
            events.append("service_exit")

        def index_version(self) -> SimpleNamespace:
            return _repair_index_version()

    @contextlib.contextmanager
    def fake_exclusive_lock(path: Path):
        assert path == data_root / "locks" / "corpus.lock"
        events.append("lock_enter")
        try:
            yield
        finally:
            events.append("lock_exit")

    def fake_build_service(*args: object, **kwargs: object) -> FakeService:
        nonlocal attempts
        assert (args, kwargs) == ((), {"startup_policy": "repair"})
        attempts += 1
        if attempts == 1:
            raise IndexRepairRequiredError("journal cannot be reconciled")
        return FakeService()

    monkeypatch.setenv("HISTORICAL_CORPUS_DATA_DIR", str(data_root))
    monkeypatch.setattr(cli, "exclusive_lock", fake_exclusive_lock)
    monkeypatch.setattr(cli, "_read_index_generation", lambda path: 4, raising=False)
    monkeypatch.setattr(cli, "build_service_from_env", fake_build_service)

    first_code = cli.main(["repair-index"])
    first = capsys.readouterr()
    second_code = cli.main(["repair-index"])
    second = capsys.readouterr()

    assert first_code == 5
    assert first.out == ""
    assert _json_line(first.err)["error"] == {
        "code": "INDEX_REPAIR_REQUIRED",
        "message": "journal cannot be reconciled",
    }
    assert second_code == 0
    assert second.err == ""
    assert _json_line(second.out)["repaired"] is True
    assert events == [
        "lock_enter",
        "lock_exit",
        "lock_enter",
        "service_exit",
        "lock_exit",
    ]


def test_repair_index_rejects_force_flag_before_service_construction(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        cli,
        "build_service_from_env",
        lambda *args, **kwargs: pytest.fail("must not construct service"),
    )

    code = cli.main(["repair-index", "--force"])

    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""
    assert _json_line(captured.err)["error"]["code"] == "INPUT_ERROR"


@pytest.mark.parametrize("data_dir", ["", "   "])
def test_repair_index_rejects_blank_runtime_data_dir_before_lock(
    data_dir: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("HISTORICAL_CORPUS_DATA_DIR", data_dir)
    monkeypatch.setattr(
        cli,
        "exclusive_lock",
        lambda path: pytest.fail("must not acquire a lock for invalid config"),
    )
    monkeypatch.setattr(
        cli,
        "build_service_from_env",
        lambda *args, **kwargs: pytest.fail("must not construct service"),
    )

    code = cli.main(["repair-index"])

    captured = capsys.readouterr()
    assert code == 5
    assert captured.out == ""
    assert _json_line(captured.err)["error"] == {
        "code": "PROCESSING_ERROR",
        "message": "HISTORICAL_CORPUS_DATA_DIR must be a non-empty string",
    }


def _write_evaluation_inputs(tmp_path: Path) -> tuple[Path, Path, Path, Path]:
    data_root = tmp_path / "data"
    imports_root = tmp_path / "imports"
    sample_path = data_root / "staging" / "sample.json"
    gold_path = imports_root / "gold.jsonl"
    report_path = data_root / "reports" / "ocr-report.json"
    sample_path.parent.mkdir(parents=True)
    imports_root.mkdir()
    sample_path.write_text(
        json.dumps(_evaluation_sample(), ensure_ascii=False), encoding="utf-8"
    )
    gold_path.write_text(
        json.dumps(_gold_payload(), ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return data_root, imports_root, sample_path, gold_path, report_path


def _ocr_args(
    data_root: Path,
    imports_root: Path,
    sample_path: Path | str,
    gold_path: Path | str,
    report_path: Path | str,
) -> list[str]:
    return [
        "evaluate-ocr",
        "--sample",
        str(sample_path),
        "--gold",
        str(gold_path),
        "--report",
        str(report_path),
        "--data-root",
        str(data_root),
        "--imports-root",
        str(imports_root),
    ]


def test_evaluate_ocr_cli_success_writes_atomic_text_free_report(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root, imports_root, sample_path, gold_path, report_path = (
        _write_evaluation_inputs(tmp_path)
    )

    def evaluate_one(sample, gold):
        return run_ocr_evaluation(
            sample,
            gold,
            config=OcrGateConfig(expectedPageCount=1),
            evaluated_at=EVALUATED_AT,
        )

    monkeypatch.setattr(cli, "evaluate_ocr", evaluate_one, raising=False)
    code = cli.main(
        _ocr_args(data_root, imports_root, sample_path, gold_path, report_path)
    )

    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    summary = _json_line(captured.out)
    assert summary["command"] == "evaluate-ocr"
    assert summary["passed"] is True
    assert "ciudad histórica" not in captured.out
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["passed"] is True
    assert report["metrics"]["cer"] == 0.0
    assert not [path for path in report_path.parent.iterdir() if path != report_path]


def test_evaluate_ocr_cli_gate_failure_writes_report_and_exits_five(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root, imports_root, sample_path, gold_path, report_path = (
        _write_evaluation_inputs(tmp_path)
    )
    code = cli.main(
        _ocr_args(data_root, imports_root, sample_path, gold_path, report_path)
    )
    captured = capsys.readouterr()
    assert code == 5
    assert captured.err == ""
    assert _json_line(captured.out)["passed"] is False
    assert json.loads(report_path.read_text(encoding="utf-8"))["passed"] is False


def test_evaluate_ocr_cli_rejects_divergent_gold_and_disguised_bundle(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root, imports_root, sample_path, gold_path, report_path = (
        _write_evaluation_inputs(tmp_path)
    )
    divergent = _gold_payload(logicalPageNumber=2)
    gold_path.write_text(json.dumps(divergent) + "\n", encoding="utf-8")
    code = cli.main(
        _ocr_args(data_root, imports_root, sample_path, gold_path, report_path)
    )
    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""
    assert _json_line(captured.err)["error"]["code"] == "INPUT_ERROR"
    assert not report_path.exists()

    sample_path.write_text(json.dumps(_prepared_document()), encoding="utf-8")
    gold_path.write_text(json.dumps(_gold_payload()) + "\n", encoding="utf-8")
    monkeypatch.setattr(
        cli,
        "evaluate_ocr",
        lambda *args: pytest.fail("disguised bundle must be rejected before evaluation"),
        raising=False,
    )
    code = cli.main(
        _ocr_args(data_root, imports_root, sample_path, gold_path, report_path)
    )
    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""
    assert _json_line(captured.err)["error"]["code"] == "INPUT_ERROR"


def test_evaluate_ocr_cli_rejects_outside_and_symlink_paths(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root, imports_root, sample_path, gold_path, report_path = (
        _write_evaluation_inputs(tmp_path)
    )
    outside = tmp_path / "outside.json"
    outside.write_text(sample_path.read_text(encoding="utf-8"), encoding="utf-8")
    unsafe_calls = [
        _ocr_args(data_root, imports_root, outside, gold_path, report_path),
        _ocr_args(data_root, imports_root, sample_path, "../gold.jsonl", report_path),
        _ocr_args(data_root, imports_root, sample_path, gold_path, "outside.json"),
    ]
    for args in unsafe_calls:
        code = cli.main(args)
        captured = capsys.readouterr()
        assert code == 2
        assert captured.out == ""
        assert _json_line(captured.err)["error"]["code"] == "INPUT_ERROR"

    link = data_root / "staging" / "sample-link.json"
    link.symlink_to(sample_path)
    code = cli.main(_ocr_args(data_root, imports_root, link, gold_path, report_path))
    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""
    assert _json_line(captured.err)["error"]["code"] == "INPUT_ERROR"

    gold_link = imports_root / "gold-link.jsonl"
    gold_link.symlink_to(gold_path)
    code = cli.main(_ocr_args(data_root, imports_root, sample_path, gold_link, report_path))
    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""

    gold_directory = imports_root / "gold-directory"
    gold_directory.mkdir()
    code = cli.main(
        _ocr_args(data_root, imports_root, sample_path, gold_directory, report_path)
    )
    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_directory = report_path.parent / "directory.json"
    report_directory.mkdir()
    code = cli.main(
        _ocr_args(data_root, imports_root, sample_path, gold_path, report_directory)
    )
    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""

    outside_report = tmp_path / "outside-report.json"
    outside_report.write_bytes(b"unchanged")
    report_link = report_path.parent / "report-link.json"
    report_link.symlink_to(outside_report)
    code = cli.main(
        _ocr_args(data_root, imports_root, sample_path, gold_path, report_link)
    )
    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""
    assert outside_report.read_bytes() == b"unchanged"


def test_evaluate_ocr_cli_does_not_overwrite_input_or_partial_report(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root, _, sample_path, _, report_path = _write_evaluation_inputs(tmp_path)
    shared_input = data_root / "reports" / "shared.jsonl"
    shared_input.parent.mkdir(parents=True)
    shared_bytes = json.dumps(_gold_payload()).encode() + b"\n"
    shared_input.write_bytes(shared_bytes)
    code = cli.main(
        _ocr_args(data_root, data_root, sample_path, shared_input, shared_input)
    )
    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""
    assert shared_input.read_bytes() == shared_bytes

    report_path.write_bytes(b"old-report\n")

    def evaluate_one(sample, gold):
        return run_ocr_evaluation(
            sample,
            gold,
            config=OcrGateConfig(expectedPageCount=1),
            evaluated_at=EVALUATED_AT,
        )

    monkeypatch.setattr(cli, "evaluate_ocr", evaluate_one, raising=False)
    import historical_corpus.staging as staging

    def fail_replace(*args: object) -> None:
        raise OSError("replace failed")

    monkeypatch.setattr(staging.os, "replace", fail_replace)
    gold_path = tmp_path / "imports" / "gold.jsonl"
    code = cli.main(
        _ocr_args(data_root, tmp_path / "imports", sample_path, gold_path, report_path)
    )
    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""
    assert report_path.read_bytes() == b"old-report\n"
    assert not [path for path in report_path.parent.iterdir() if path.name.startswith(".ocr-report")]


def _write_retrieval_cases(tmp_path: Path) -> tuple[Path, Path, Path]:
    data_root = tmp_path / "retrieval-data"
    imports_root = tmp_path / "retrieval-imports"
    cases_path = imports_root / "cases.jsonl"
    report_path = data_root / "reports" / "retrieval-report.json"
    data_root.mkdir()
    imports_root.mkdir()
    cases_path.write_text(
        json.dumps(_retrieval_case_payload(query="SECRET QUERY"), ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )
    return data_root, cases_path, report_path


def _retrieval_args(
    data_root: Path,
    cases_path: Path,
    report_path: Path,
    *,
    url: str = "http://historical-corpus-api:3010",
) -> list[str]:
    return [
        "evaluate-retrieval",
        "--api-base-url",
        url,
        "--cases",
        str(cases_path),
        "--report",
        str(report_path),
        "--data-root",
        str(data_root),
        "--imports-root",
        str(cases_path.parent),
    ]


def test_evaluate_retrieval_cli_compose_url_fake_transport_and_gate_codes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root, cases_path, report_path = _write_retrieval_cases(tmp_path)
    fake = _FakeRetrievalApi()

    def evaluate_one(url, cases):
        assert url == "http://historical-corpus-api:3010"
        return run_retrieval_evaluation(
            url,
            cases,
            transport=httpx2.MockTransport(fake),
            config=RetrievalGateConfig(minimumCaseCount=1),
            evaluated_at=EVALUATED_AT,
        )

    monkeypatch.setattr(cli, "evaluate_retrieval", evaluate_one, raising=False)
    code = cli.main(_retrieval_args(data_root, cases_path, report_path))
    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    assert _json_line(captured.out)["passed"] is True
    assert "SECRET QUERY" not in captured.out
    assert json.loads(report_path.read_text(encoding="utf-8"))["passed"] is True

    def evaluate_default(url, cases):
        return run_retrieval_evaluation(
            url,
            cases,
            transport=httpx2.MockTransport(_FakeRetrievalApi()),
            evaluated_at=EVALUATED_AT,
        )

    monkeypatch.setattr(cli, "evaluate_retrieval", evaluate_default, raising=False)
    code = cli.main(_retrieval_args(data_root, cases_path, report_path))
    captured = capsys.readouterr()
    assert code == 5
    assert captured.err == ""
    assert _json_line(captured.out)["passed"] is False


def test_evaluate_retrieval_cli_rejects_invalid_url_before_transport(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    data_root, cases_path, report_path = _write_retrieval_cases(tmp_path)

    def evaluate_invalid(url, cases):
        return run_retrieval_evaluation(
            url,
            cases,
            transport=httpx2.MockTransport(
                lambda request: pytest.fail("invalid URL must not reach transport")
            ),
        )

    monkeypatch.setattr(cli, "evaluate_retrieval", evaluate_invalid, raising=False)
    code = cli.main(
        _retrieval_args(
            data_root,
            cases_path,
            report_path,
            url="https://historical-corpus-api:3010",
        )
    )
    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""
    assert _json_line(captured.err)["error"]["code"] == "INPUT_ERROR"
    assert not report_path.exists()
