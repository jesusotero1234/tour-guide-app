from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

from .manifest import (
    ManifestValidationError,
    load_manifest,
    validate_manifest_source,
)
from .page_inventory import (
    PageInventoryError,
    build_inventory_signals,
    finalize_inventory,
    serialize_inventory_jsonl,
)
from .pdf_source import PdfSourceError, iter_rendered_leaves


EXIT_SUCCESS = 0
EXIT_INPUT = 2
EXIT_RIGHTS = 3
EXIT_LOCK = 4
EXIT_PROCESSING = 5
EXIT_PUBLICATION = 6


class CliInputError(ValueError):
    pass


class CliHelp(Exception):
    def __init__(self, help_text: str) -> None:
        super().__init__(help_text)
        self.help_text = help_text


class _JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise CliInputError(message)

    def print_help(self, file: object = None) -> None:
        raise CliHelp(self.format_help())


def _parser() -> argparse.ArgumentParser:
    parser = _JsonArgumentParser(prog="historical-corpus-ingest")
    commands = parser.add_subparsers(dest="command", required=True)

    validate = commands.add_parser("validate-manifest")
    validate.add_argument("--manifest", required=True)
    validate.add_argument("--imports-root", default="/imports")
    validate.add_argument("--check-source", action="store_true")

    inventory = commands.add_parser("build-inventory")
    inventory.add_argument("--manifest", required=True)
    inventory.add_argument("--imports-root", default="/imports")
    inventory.add_argument("--output-root", default="/inventory-output")
    return parser


def _emit(payload: object, *, error: bool = False) -> None:
    stream = sys.stderr if error else sys.stdout
    stream.write(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        + "\n"
    )


def _validate_manifest_command(args: argparse.Namespace) -> dict[str, object]:
    manifest = load_manifest(args.manifest)
    result: dict[str, object] = {
        "ok": True,
        "command": "validate-manifest",
        "documentId": manifest.document.documentId,
        "sourceChecked": bool(args.check_source),
        "prepareAllowed": manifest.prepare_allowed,
        "publishAllowed": manifest.publish_allowed,
    }
    if args.check_source:
        source = validate_manifest_source(manifest, Path(args.imports_root))
        result.update(
            {
                "pdfSha256": f"sha256:{source.pdf_sha256}",
                "inventorySha256": (
                    None
                    if source.inventory_sha256 is None
                    else f"sha256:{source.inventory_sha256}"
                ),
                "pdfPages": source.pdf_page_count,
            }
        )
    return result


def _ensure_output_directory(output_root: str | Path, storage_key: str) -> Path:
    root = Path(output_root)
    if root.is_symlink():
        raise CliInputError("output root must not be a symlink")
    root.mkdir(parents=True, exist_ok=True)
    root = root.resolve(strict=True)
    if not stat.S_ISDIR(root.stat().st_mode):
        raise CliInputError("output root must be a directory")

    directory = root / storage_key
    if directory.is_symlink():
        raise CliInputError("inventory output directory must not be a symlink")
    directory.mkdir(mode=0o750, exist_ok=True)
    resolved = directory.resolve(strict=True)
    if resolved.parent != root or resolved.name != storage_key:
        raise CliInputError("inventory output directory escapes output root")
    return resolved


def _atomic_write_inventory(
    output_root: str | Path,
    document_id: str,
    payload: bytes,
) -> Path:
    storage_key = hashlib.sha256(document_id.encode("utf-8")).hexdigest()
    directory = _ensure_output_directory(output_root, storage_key)
    target = directory / "page-inventory.jsonl"
    if target.is_symlink():
        raise CliInputError("inventory target must not be a symlink")
    if target.exists() and not stat.S_ISREG(target.stat().st_mode):
        raise CliInputError("inventory target must be a regular file")

    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=".page-inventory.",
            suffix=".tmp",
            dir=directory,
            delete=False,
        ) as handle:
            temporary = Path(handle.name)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
        temporary = None
        directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return target


def _build_inventory_command(args: argparse.Namespace) -> dict[str, object]:
    manifest = load_manifest(args.manifest)
    source = validate_manifest_source(manifest, Path(args.imports_root))
    rendered_leaves = iter_rendered_leaves(source.pdf_path, manifest)
    signals = build_inventory_signals(rendered_leaves, manifest)
    records = finalize_inventory(signals, manifest)
    payload = serialize_inventory_jsonl(records)
    target = _atomic_write_inventory(
        args.output_root,
        manifest.document.documentId,
        payload,
    )
    return {
        "ok": True,
        "command": "build-inventory",
        "documentId": manifest.document.documentId,
        "path": str(target),
        "sha256": "sha256:" + hashlib.sha256(payload).hexdigest(),
        "records": len(records),
        "pendingReview": sum(
            record.canonicalStatus == "pending_review" for record in records
        ),
    }


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = _parser().parse_args(argv)
        if args.command == "validate-manifest":
            result = _validate_manifest_command(args)
        elif args.command == "build-inventory":
            result = _build_inventory_command(args)
        else:
            raise CliInputError("unknown command")
    except CliHelp as exc:
        _emit({"ok": True, "command": "help", "help": exc.help_text})
        return EXIT_SUCCESS
    except (
        CliInputError,
        ManifestValidationError,
        PageInventoryError,
        PdfSourceError,
        OSError,
    ) as exc:
        _emit(
            {"ok": False, "error": {"code": "INPUT_ERROR", "message": str(exc)}},
            error=True,
        )
        return EXIT_INPUT
    _emit(result)
    return EXIT_SUCCESS


if __name__ == "__main__":
    raise SystemExit(main())
