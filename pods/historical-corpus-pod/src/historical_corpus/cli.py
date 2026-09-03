from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
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
from .locks import CorpusLockError, exclusive_lock
from .madoz_pipeline import (
    PipelineError,
    prepare_document,
    prepare_evaluation_sample,
)
from .madoz_processor import ProcessorError, open_processor, prepare_source
from .ocr_backend import (
    OcrBackendError,
    load_model_lock,
    prefetch_models,
    verify_model_lock,
)
from .page_inventory import (
    PageInventoryError,
    apply_duplicate_decisions,
    build_inventory_signals,
    finalize_inventory,
    load_verified_inventory,
    serialize_inventory_jsonl,
)
from .pdf_source import PdfSourceError, iter_rendered_leaves, verify_pdf_sha256
from .runtime import build_service_from_env
from .service import (
    DocumentConflictError,
    HistoricalCorpusError,
    IndexRepairRequiredError,
    RightsNotReusableError,
)
from .evaluation import (
    OcrEvaluationError,
    RetrievalEvaluationError,
    evaluate_ocr,
    evaluate_retrieval,
    load_ocr_gold_jsonl,
    load_retrieval_cases_jsonl,
)
from .staging import (
    StagingError,
    _atomic_write,
    _canonical_payload,
    _read_regular_file,
    load_evaluation_sample,
    load_prepared_document,
)


EXIT_SUCCESS = 0
EXIT_INPUT = 2
EXIT_RIGHTS = 3
EXIT_LOCK = 4
EXIT_PROCESSING = 5
EXIT_PUBLICATION = 6


class CliInputError(ValueError):
    pass


class CliPublicationError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.code = "PUBLICATION_BLOCKED"


class CliProcessingError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.code = "PROCESSING_ERROR"


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

    prefetch = commands.add_parser("prefetch-models")
    prefetch.add_argument("--manifest", required=True)
    prefetch.add_argument("--model-cache-root", default="/model-cache/paddlex")
    prefetch.add_argument("--data-root", default="/data")

    prepare_sample = commands.add_parser("prepare-sample")
    prepare_sample.add_argument("--manifest", required=True)
    prepare_sample.add_argument("--pages", required=True)
    prepare_sample.add_argument("--imports-root", default="/imports")
    prepare_sample.add_argument("--data-root", default="/data")
    prepare_sample.add_argument("--model-cache-root", default="/model-cache/paddlex")

    prepare = commands.add_parser("prepare")
    prepare.add_argument("--manifest", required=True)
    prepare.add_argument("--imports-root", default="/imports")
    prepare.add_argument("--data-root", default="/data")
    prepare.add_argument("--model-cache-root", default="/model-cache/paddlex")

    ocr_smoke = commands.add_parser("ocr-smoke")
    ocr_smoke.add_argument("--manifest", required=True)
    ocr_smoke.add_argument("--pdf-page", required=True, type=int)
    ocr_smoke.add_argument("--side", required=True, choices=("full", "left", "right"))
    ocr_smoke.add_argument("--imports-root", default="/imports")
    ocr_smoke.add_argument("--data-root", default="/data")
    ocr_smoke.add_argument("--model-cache-root", default="/model-cache/paddlex")

    publish = commands.add_parser("publish")
    publish.add_argument("--prepared", required=True)
    publish.add_argument("--data-root", default="/data")

    repair_index = commands.add_parser("repair-index")

    evaluate_ocr = commands.add_parser("evaluate-ocr")
    evaluate_ocr.add_argument("--sample", required=True)
    evaluate_ocr.add_argument("--gold", required=True)
    evaluate_ocr.add_argument("--report", required=True)
    evaluate_ocr.add_argument("--data-root", default="/data")
    evaluate_ocr.add_argument("--imports-root", default="/imports")

    evaluate_retrieval = commands.add_parser("evaluate-retrieval")
    evaluate_retrieval.add_argument("--api-base-url", required=True)
    evaluate_retrieval.add_argument("--cases", required=True)
    evaluate_retrieval.add_argument("--report", required=True)
    evaluate_retrieval.add_argument("--data-root", default="/data")
    evaluate_retrieval.add_argument("--imports-root", default="/imports")

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
    decided = apply_duplicate_decisions(signals, manifest)
    records = finalize_inventory(decided, manifest)
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


def _parse_page_refs(raw: str) -> tuple[tuple[int, str], ...]:
    refs: list[tuple[int, str]] = []
    seen: set[tuple[int, str]] = set()
    for item in raw.split(","):
        if not item:
            raise CliInputError(f"invalid page reference '{item}'")
        parts = item.split(":")
        if len(parts) != 2:
            raise CliInputError(f"invalid page reference '{item}'")
        page_text, side = parts
        if not page_text.isascii() or not page_text.isdigit() or int(page_text) <= 0:
            raise CliInputError(f"invalid page reference '{item}'")
        if side not in {"full", "left", "right"}:
            raise CliInputError(f"invalid page reference '{item}'")
        ref = (int(page_text), side)
        if ref in seen:
            raise CliInputError(f"invalid page reference '{item}'")
        seen.add(ref)
        refs.append(ref)
    if not refs:
        raise CliInputError("invalid page reference ''")
    return tuple(refs)


def _prepare_sample_command(args: argparse.Namespace) -> dict[str, object]:
    refs = _parse_page_refs(args.pages)
    result = prepare_evaluation_sample(
        Path(args.manifest),
        refs,
        imports_root=Path(args.imports_root),
        data_root=Path(args.data_root),
        model_cache_root=Path(args.model_cache_root),
    )
    return {
        "ok": True,
        "command": "prepare-sample",
        "path": str(result.path),
        "sampleHash": result.sample.sampleHash,
        "pageCount": len(result.sample.selectedPages),
        "warnings": list(result.warnings),
        "publishable": False,
    }


def _prepare_command(args: argparse.Namespace) -> dict[str, object]:
    result = prepare_document(
        Path(args.manifest),
        imports_root=Path(args.imports_root),
        data_root=Path(args.data_root),
        model_cache_root=Path(args.model_cache_root),
    )
    return {
        "ok": True,
        "command": "prepare",
        "sourcePath": str(result.source_path),
        "preparedDocumentPath": str(result.prepared_document_path),
        "reportPath": str(result.report_path),
        "preparedDocumentHash": result.prepared_document.preparedDocumentHash,
        "report": result.report.model_dump(mode="json", by_alias=True, exclude_none=False),
        "warnings": list(result.warnings),
    }


def _ocr_smoke_command(args: argparse.Namespace) -> dict[str, object]:
    manifest = load_manifest(args.manifest)
    pdf_page = args.pdf_page
    if pdf_page < 1:
        raise CliInputError(f"pdf-page must be >= 1, got {pdf_page}")
    imports_root = Path(args.imports_root)
    data_root = Path(args.data_root)
    model_cache_root = Path(args.model_cache_root)
    lock_path = data_root / "locks" / "madoz-prepare.lock"
    with exclusive_lock(lock_path):
        validated = validate_manifest_source(manifest, imports_root)
        if validated.inventory_path is None:
            raise CliInputError("verified page inventory is required")
        payload = validated.inventory_path.read_bytes()
        records = load_verified_inventory(payload, manifest)
        record = None
        for candidate in records:
            if (
                candidate.pdfPage == pdf_page
                and candidate.side == args.side
                and candidate.canonicalStatus == "include"
            ):
                record = candidate
                break
        if record is None:
            raise CliInputError(
                f"no include record for pdfPage={pdf_page} side={args.side}"
            )
        canonical = prepare_source(manifest, imports_root, data_root)
        returned_lock = load_model_lock(model_cache_root, manifest.processing.modelLockFile)
        verify_model_lock(model_cache_root, returned_lock)
        with open_processor(manifest, canonical, model_cache_root) as processor:
            result = processor.process_page(record)
    return {
        "ok": True,
        "command": "ocr-smoke",
        "documentId": result.documentId,
        "pageId": result.pageId,
        "logicalPageNumber": result.logicalPageNumber,
        "pdfPage": result.sourcePdfPageNumber,
        "side": result.leafSide,
        "lineCount": len(result.lines),
        "qualityFlags": list(result.qualityFlags),
        "meanConfidence": result.meanConfidence,
    }


def _normalize_confined_path(
    raw: str,
    root: Path,
    *,
    required_first_segment: str | None = None,
) -> str:
    if not raw:
        raise CliInputError("path must not be empty")
    segments = raw.split("/")
    for i, segment in enumerate(segments):
        if not segment:
            if i == 0 and raw.startswith("/"):
                continue
            raise CliInputError("path contains an unsafe segment")
        if segment in {".", ".."} or "\\" in segment or "\x00" in segment or "%" in segment:
            raise CliInputError("path contains an unsafe segment")
    candidate = Path(raw)
    if candidate.is_absolute():
        normalized = os.path.normpath(str(candidate))
        root_normalized = os.path.normpath(str(root))
        if not normalized.startswith(root_normalized + os.sep):
            raise CliInputError("path must be beneath the supplied root")
        relative = Path(normalized[len(root_normalized) + 1:])
    else:
        relative = Path(os.path.normpath(str(raw)))
    parts = relative.parts
    if not parts:
        raise CliInputError("path must not be empty")
    if required_first_segment is not None and parts[0] != required_first_segment:
        raise CliInputError(f"path must start with {required_first_segment}")
    return str(relative)


def _check_report_collision(
    report_relative: str,
    input_relative: str,
    data_root: Path,
    input_root: Path,
) -> None:
    report_abs = os.path.abspath(data_root / report_relative)
    input_abs = os.path.abspath(input_root / input_relative)
    if report_abs == input_abs:
        raise CliInputError("report path collides with an input path")


def _write_evaluation_report(
    data_root: Path,
    report_relative: str,
    report: object,
) -> Path:
    payload = _canonical_payload(report) + b"\n"
    return _atomic_write(
        data_root,
        report_relative,
        payload,
        max_bytes=8 * 1024 * 1024,
        limit_label="8 MiB",
    )


def _normalize_prepared_path(raw: str, data_root: Path) -> str:
    candidate = Path(raw)
    if candidate.is_absolute():
        normalized = os.path.normpath(str(candidate))
        root_normalized = os.path.normpath(str(data_root))
        if not normalized.startswith(root_normalized + os.sep):
            raise CliInputError("prepared path must be beneath data root")
        relative = Path(normalized[len(root_normalized) + 1:])
    else:
        relative = Path(os.path.normpath(str(candidate)))
    parts = relative.parts
    if not parts or parts[0] != "staging":
        raise CliInputError("prepared path must start with staging")
    return str(relative)


def _publish_command(args: argparse.Namespace) -> dict[str, object]:
    data_root = Path(args.data_root)
    relative = _normalize_prepared_path(args.prepared, data_root)
    prepared = load_prepared_document(data_root, relative)
    if not prepared.metadata.rights.isExplicitlyReusable:
        raise RightsNotReusableError("source reuse rights are not explicitly verified")
    if not prepared.metadata.sourceIsExactRecord or not prepared.publicationGate.sourceIsExactRecord:
        raise CliPublicationError("source is not an exact record")
    if not prepared.publicationGate.coverage.acceptedForProduct:
        raise CliPublicationError("coverage has not been accepted for product")
    lock_path = data_root / "locks" / "corpus.lock"
    with exclusive_lock(lock_path):
        try:
            verify_pdf_sha256(
                data_root / prepared.canonicalPdfRelativePath,
                prepared.metadata.canonicalPdfSha256,
            )
        except PdfSourceError as exc:
            raise CliProcessingError(str(exc)) from exc
        try:
            service = build_service_from_env(startup_policy="repair")
        except (OSError, ValueError) as exc:
            raise CliProcessingError(str(exc)) from exc
        with service:
            result = service.ingest_prepared(prepared)
    return {
        "ok": True,
        "command": "publish",
        "documentId": result.documentId,
        "chunkIds": list(result.chunkIds),
        "chunkCount": len(result.chunkIds),
    }


def _read_index_generation(db_path: Path) -> int | None:
    if not db_path.exists():
        return None
    uri = db_path.resolve().as_uri() + "?mode=ro"
    try:
        conn = sqlite3.connect(uri, uri=True)
        try:
            row = conn.execute("SELECT generation FROM index_state WHERE id = 1").fetchone()
        finally:
            conn.close()
    except sqlite3.OperationalError as exc:
        if "no such table: index_state" in str(exc):
            return None
        raise CliProcessingError(str(exc)) from exc
    except sqlite3.Error as exc:
        raise CliProcessingError(str(exc)) from exc
    if row is None:
        return None
    value = row[0]
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise CliProcessingError("index_state.generation must be a non-negative integer")
    return value


def _repair_index_command(args: argparse.Namespace) -> dict[str, object]:
    raw_data_dir = os.environ.get("HISTORICAL_CORPUS_DATA_DIR", "/data")
    if not raw_data_dir.strip():
        raise CliProcessingError("HISTORICAL_CORPUS_DATA_DIR must be a non-empty string")
    data_root = Path(raw_data_dir.strip())
    lock_path = data_root / "locks" / "corpus.lock"
    with exclusive_lock(lock_path):
        prior_generation = _read_index_generation(data_root / "corpus.sqlite3")
        try:
            service = build_service_from_env(startup_policy="repair")
        except (OSError, ValueError) as exc:
            raise CliProcessingError(str(exc)) from exc
        with service:
            index_version = service.index_version()
            generation = index_version.generation
            index_version_value = index_version.indexVersion
            corpus_index_version_value = index_version.corpusIndexVersion
            document_count = index_version.documentCount
            chunk_count = index_version.chunkCount
    repaired = prior_generation is None or prior_generation != generation
    return {
        "ok": True,
        "command": "repair-index",
        "repaired": repaired,
        "generation": generation,
        "indexVersion": index_version_value,
        "corpusIndexVersion": corpus_index_version_value,
        "documentCount": document_count,
        "chunkCount": chunk_count,
    }


def _evaluate_ocr_command(args: argparse.Namespace) -> dict[str, object]:
    data_root = Path(args.data_root)
    imports_root = Path(args.imports_root)
    sample_relative = _normalize_confined_path(args.sample, data_root, required_first_segment="staging")
    gold_relative = _normalize_confined_path(args.gold, imports_root)
    report_relative = _normalize_confined_path(args.report, data_root, required_first_segment="reports")
    _check_report_collision(report_relative, sample_relative, data_root, data_root)
    _check_report_collision(report_relative, gold_relative, data_root, imports_root)
    sample = load_evaluation_sample(data_root, sample_relative)
    gold_bytes = _read_regular_file(imports_root, gold_relative, max_bytes=8 * 1024 * 1024, limit_label="8 MiB")
    gold = load_ocr_gold_jsonl(gold_bytes)
    report = evaluate_ocr(sample, gold)
    written = _write_evaluation_report(data_root, report_relative, report)
    return {
        "ok": report.passed,
        "command": "evaluate-ocr",
        "report": str(written),
        "passed": report.passed,
        "metrics": report.metrics.model_dump(mode="json"),
        "gates": dict(report.gates),
    }


def _evaluate_retrieval_command(args: argparse.Namespace) -> dict[str, object]:
    data_root = Path(args.data_root)
    imports_root = Path(args.imports_root)
    cases_relative = _normalize_confined_path(args.cases, imports_root)
    report_relative = _normalize_confined_path(args.report, data_root, required_first_segment="reports")
    _check_report_collision(report_relative, cases_relative, data_root, imports_root)
    cases_bytes = _read_regular_file(imports_root, cases_relative, max_bytes=2 * 1024 * 1024, limit_label="2 MiB")
    cases = load_retrieval_cases_jsonl(cases_bytes)
    report = evaluate_retrieval(args.api_base_url, cases)
    written = _write_evaluation_report(data_root, report_relative, report)
    return {
        "ok": report.passed,
        "command": "evaluate-retrieval",
        "report": str(written),
        "passed": report.passed,
        "metrics": report.metrics.model_dump(mode="json"),
        "gates": dict(report.gates),
    }


def _prefetch_models_command(args: argparse.Namespace) -> dict[str, object]:
    manifest = load_manifest(args.manifest)
    model_cache_root = Path(args.model_cache_root)
    lock_path = Path(args.data_root) / "locks" / "madoz-prepare.lock"
    with exclusive_lock(lock_path):
        returned_lock = prefetch_models(model_cache_root, manifest.processing.modelLockFile)
    return {
        "ok": True,
        "command": "prefetch-models",
        "lockPath": str(model_cache_root / manifest.processing.modelLockFile),
        "modelCount": len(returned_lock.models),
    }


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = _parser().parse_args(argv)
        if args.command == "validate-manifest":
            result = _validate_manifest_command(args)
        elif args.command == "build-inventory":
            result = _build_inventory_command(args)
        elif args.command == "prefetch-models":
            result = _prefetch_models_command(args)
        elif args.command == "prepare-sample":
            result = _prepare_sample_command(args)
        elif args.command == "prepare":
            result = _prepare_command(args)
        elif args.command == "ocr-smoke":
            result = _ocr_smoke_command(args)
        elif args.command == "publish":
            result = _publish_command(args)
        elif args.command == "repair-index":
            result = _repair_index_command(args)
        elif args.command == "evaluate-ocr":
            result = _evaluate_ocr_command(args)
        elif args.command == "evaluate-retrieval":
            result = _evaluate_retrieval_command(args)
        else:
            raise CliInputError("unknown command")
    except CliHelp as exc:
        _emit({"ok": True, "command": "help", "help": exc.help_text})
        return EXIT_SUCCESS
    except CorpusLockError as exc:
        _emit(
            {"ok": False, "error": {"code": "LOCKED", "message": str(exc)}},
            error=True,
        )
        return EXIT_LOCK
    except RightsNotReusableError as exc:
        _emit(
            {"ok": False, "error": {"code": "REUSE_RIGHTS_NOT_VERIFIED", "message": str(exc)}},
            error=True,
        )
        return EXIT_RIGHTS
    except CliPublicationError as exc:
        _emit(
            {"ok": False, "error": {"code": exc.code, "message": str(exc)}},
            error=True,
        )
        return EXIT_PUBLICATION
    except DocumentConflictError as exc:
        _emit(
            {"ok": False, "error": {"code": exc.code, "message": str(exc)}},
            error=True,
        )
        return EXIT_PUBLICATION
    except IndexRepairRequiredError as exc:
        _emit(
            {"ok": False, "error": {"code": exc.code, "message": str(exc)}},
            error=True,
        )
        return EXIT_PROCESSING
    except HistoricalCorpusError as exc:
        _emit(
            {"ok": False, "error": {"code": exc.code, "message": str(exc)}},
            error=True,
        )
        return EXIT_PROCESSING
    except (OcrBackendError, ProcessorError, CliProcessingError) as exc:
        _emit(
            {"ok": False, "error": {"code": "PROCESSING_ERROR", "message": str(exc)}},
            error=True,
        )
        return EXIT_PROCESSING
    except (
        CliInputError,
        ManifestValidationError,
        PageInventoryError,
        PdfSourceError,
        PipelineError,
        StagingError,
        OcrEvaluationError,
        RetrievalEvaluationError,
        OSError,
    ) as exc:
        _emit(
            {"ok": False, "error": {"code": "INPUT_ERROR", "message": str(exc)}},
            error=True,
        )
        return EXIT_INPUT
    _emit(result)
    if args.command in {"evaluate-ocr", "evaluate-retrieval"} and not result["passed"]:
        return EXIT_PROCESSING
    return EXIT_SUCCESS


if __name__ == "__main__":
    raise SystemExit(main())
