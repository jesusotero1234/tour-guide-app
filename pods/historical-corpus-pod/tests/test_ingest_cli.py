from __future__ import annotations

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from historical_corpus import cli
from historical_corpus.manifest import ManifestValidationError


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
