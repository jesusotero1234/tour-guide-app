from __future__ import annotations

import contextlib
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from historical_corpus import cli
from historical_corpus.locks import CorpusLockError
from historical_corpus.manifest import ManifestValidationError
from historical_corpus.ocr_backend import OcrBackendError


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
    monkeypatch.setattr(cli, "load_manifest", lambda path: manifest)
    monkeypatch.setattr(cli, "validate_manifest_source", lambda value, root: validated)
    monkeypatch.setattr(cli, "iter_rendered_leaves", lambda path, value: rendered)

    def fake_signals(value: object, loaded: object) -> object:
        assert value is rendered
        assert loaded is manifest
        return signals

    def fake_finalize(value: object, loaded: object) -> object:
        assert value is signals
        assert loaded is manifest
        return records

    monkeypatch.setattr(cli, "build_inventory_signals", fake_signals)
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
