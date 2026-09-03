from __future__ import annotations

import hashlib
import os
import re
import stat
import tempfile
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from .identity import canonical_json_bytes
from .ingest_models import (
    OcrEvaluationSample,
    PreparationReport,
    PreparedDocument,
    StagedPage,
)


_SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_MAX_SMALL_JSON_BYTES = 8 * 1024 * 1024
_MAX_SAMPLE_BYTES = 32 * 1024 * 1024
_MAX_PREPARED_BYTES = 128 * 1024 * 1024
_READ_CHUNK_BYTES = 1024 * 1024
_ModelT = TypeVar("_ModelT", bound=BaseModel)


class StagingError(RuntimeError):
    pass


class _UnsafeStagingPath(StagingError):
    pass


class _InvalidArtifact(StagingError):
    pass


@dataclass(frozen=True)
class StagingPaths:
    directory: Path
    source: Path
    pages: Path
    evaluation_samples: Path
    prepared_document: Path
    preparation_report: Path

    def page(self, logical_page_number: int) -> Path:
        if (
            isinstance(logical_page_number, bool)
            or not isinstance(logical_page_number, int)
            or not 1 <= logical_page_number <= 2000
        ):
            raise StagingError("logical_page_number must be an integer in 1..2000")
        return self.pages / f"{logical_page_number:06d}.json"

    def evaluation_sample(self, sample_hash: str) -> Path:
        return self.evaluation_samples / f"{_sha256_hex(sample_hash, 'sample_hash')}.json"


def _sha256_hex(value: str, label: str) -> str:
    if not isinstance(value, str) or _SHA256_RE.fullmatch(value) is None:
        raise StagingError(f"{label} must be sha256:<64 lowercase hex>")
    return value.removeprefix("sha256:")


def _document_storage_key(document_id: str) -> str:
    if not isinstance(document_id, str) or not 1 <= len(document_id) <= 128:
        raise StagingError("document_id must contain 1..128 characters")
    return hashlib.sha256(document_id.encode("utf-8")).hexdigest()


def _stage_relative_directory(document_id: str, processing_fingerprint: str) -> str:
    return (
        f"staging/{_document_storage_key(document_id)}/"
        f"{_sha256_hex(processing_fingerprint, 'processing_fingerprint')}"
    )


def staging_paths(
    data_root: str | os.PathLike[str],
    document_id: str,
    processing_fingerprint: str,
) -> StagingPaths:
    directory = Path(data_root) / _stage_relative_directory(
        document_id,
        processing_fingerprint,
    )
    return StagingPaths(
        directory=directory,
        source=directory / "source.json",
        pages=directory / "pages",
        evaluation_samples=directory / "evaluation-samples",
        prepared_document=directory / "prepared-document.json",
        preparation_report=directory / "preparation-report.json",
    )


def _parse_relative_path(relative_path: str | os.PathLike[str]) -> tuple[str, ...]:
    raw = os.fspath(relative_path)
    if not isinstance(raw, str) or not raw:
        raise _UnsafeStagingPath("staging path must be a non-empty relative path")
    if "\\" in raw or "\x00" in raw or "%" in raw:
        raise _UnsafeStagingPath("staging path contains a forbidden character")
    parts = raw.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise _UnsafeStagingPath("staging path contains an unsafe segment")
    pure = PurePosixPath(raw)
    if pure.is_absolute():
        raise _UnsafeStagingPath("staging path must be relative")
    return tuple(parts)


def _data_root(
    data_root: str | os.PathLike[str],
    *,
    create: bool,
) -> Path:
    root = Path(data_root)
    try:
        if create:
            root.mkdir(parents=True, exist_ok=True)
        root_stat = root.lstat()
    except FileNotFoundError as exc:
        raise _InvalidArtifact("data_root does not exist") from exc
    except OSError as exc:
        raise StagingError("could not access data_root") from exc
    if stat.S_ISLNK(root_stat.st_mode):
        raise _UnsafeStagingPath("data_root must not be a symlink")
    if not stat.S_ISDIR(root_stat.st_mode):
        raise _UnsafeStagingPath("data_root must be a directory")
    return root.resolve(strict=True)


def _ensure_write_target(
    data_root: str | os.PathLike[str],
    relative_path: str,
) -> Path:
    parts = _parse_relative_path(relative_path)
    root = _data_root(data_root, create=True)
    parent = root
    for part in parts[:-1]:
        candidate = parent / part
        try:
            candidate.mkdir()
        except FileExistsError:
            pass
        except OSError as exc:
            raise StagingError("could not create staging directory") from exc
        try:
            candidate_stat = candidate.lstat()
        except OSError as exc:
            raise StagingError("could not inspect staging directory") from exc
        if stat.S_ISLNK(candidate_stat.st_mode):
            raise _UnsafeStagingPath("staging directory must not be a symlink")
        if not stat.S_ISDIR(candidate_stat.st_mode):
            raise _UnsafeStagingPath("staging path component must be a directory")
        parent = candidate

    target = parent / parts[-1]
    try:
        target_stat = target.lstat()
    except FileNotFoundError:
        return target
    except OSError as exc:
        raise StagingError("could not inspect staging target") from exc
    if stat.S_ISLNK(target_stat.st_mode):
        raise _UnsafeStagingPath("staging target must not be a symlink")
    if not stat.S_ISREG(target_stat.st_mode):
        raise _UnsafeStagingPath("staging target must be a regular file")
    return target


def _fsync_directory(directory: Path) -> None:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    descriptor = os.open(directory, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _atomic_write(
    data_root: str | os.PathLike[str],
    relative_path: str,
    payload: bytes,
    *,
    max_bytes: int,
    limit_label: str,
) -> Path:
    if len(payload) > max_bytes:
        raise StagingError(f"artifact exceeds {limit_label}")
    target = _ensure_write_target(data_root, relative_path)
    descriptor: int | None = None
    temporary: Path | None = None
    try:
        descriptor, temporary_name = tempfile.mkstemp(
            dir=target.parent,
            prefix=f".{target.name}.",
            suffix=".tmp",
        )
        temporary = Path(temporary_name)
        os.fchmod(descriptor, 0o600)
        offset = 0
        while offset < len(payload):
            offset += os.write(descriptor, payload[offset:])
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = None
        os.replace(temporary, target)
        temporary = None
        _fsync_directory(target.parent)
        return target
    except OSError as exc:
        raise StagingError("atomic staging write failed") from exc
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if temporary is not None:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass


def _canonical_payload(value: BaseModel | Mapping[str, object]) -> bytes:
    if isinstance(value, BaseModel):
        projection: object = value.model_dump(
            mode="json",
            by_alias=True,
            exclude_none=False,
        )
    elif isinstance(value, Mapping):
        projection = dict(value)
    else:
        raise StagingError("staged JSON value must be a Pydantic model or mapping")
    try:
        return canonical_json_bytes(projection)
    except (TypeError, ValueError) as exc:
        raise StagingError("staged value is not canonical JSON") from exc


def _read_regular_file(
    data_root: str | os.PathLike[str],
    relative_path: str | os.PathLike[str],
    *,
    max_bytes: int,
    limit_label: str,
) -> bytes:
    parts = _parse_relative_path(relative_path)
    root = _data_root(data_root, create=False)
    parent = root
    for part in parts[:-1]:
        candidate = parent / part
        try:
            candidate_stat = candidate.lstat()
        except FileNotFoundError as exc:
            raise _InvalidArtifact("staged artifact does not exist") from exc
        except OSError as exc:
            raise StagingError("could not inspect staging path") from exc
        if stat.S_ISLNK(candidate_stat.st_mode):
            raise _UnsafeStagingPath("staging directory must not be a symlink")
        if not stat.S_ISDIR(candidate_stat.st_mode):
            raise _UnsafeStagingPath("staging path component must be a directory")
        parent = candidate

    target = parent / parts[-1]
    try:
        before = target.lstat()
    except FileNotFoundError as exc:
        raise _InvalidArtifact("staged artifact does not exist") from exc
    except OSError as exc:
        raise StagingError("could not inspect staged artifact") from exc
    if stat.S_ISLNK(before.st_mode):
        raise _UnsafeStagingPath("staged artifact must not be a symlink")
    if not stat.S_ISREG(before.st_mode):
        raise _UnsafeStagingPath("staged artifact must be a regular file")
    if before.st_size > max_bytes:
        raise _InvalidArtifact(f"staged artifact exceeds {limit_label}")

    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(target, flags)
    except OSError as exc:
        raise _UnsafeStagingPath("could not safely open staged artifact") from exc
    try:
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode):
            raise _UnsafeStagingPath("staged artifact must be a regular file")
        if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            raise _UnsafeStagingPath("staged artifact changed while opening")
        if opened.st_size > max_bytes:
            raise _InvalidArtifact(f"staged artifact exceeds {limit_label}")
        remaining = opened.st_size
        chunks: list[bytes] = []
        while remaining:
            chunk = os.read(descriptor, min(_READ_CHUNK_BYTES, remaining))
            if not chunk:
                raise _InvalidArtifact("staged artifact is truncated")
            chunks.append(chunk)
            remaining -= len(chunk)
        if os.read(descriptor, 1):
            raise _InvalidArtifact("staged artifact changed while reading")
        return b"".join(chunks)
    finally:
        os.close(descriptor)


def _decode_model(data: bytes, model_type: type[_ModelT], label: str) -> _ModelT:
    try:
        return model_type.model_validate_json(data)
    except (ValidationError, ValueError, TypeError) as exc:
        raise _InvalidArtifact(f"{label} is invalid") from exc


def _page_artifact_hash(staged_page: StagedPage) -> str:
    page_payload = staged_page.page.model_dump(
        mode="json",
        by_alias=True,
        exclude_none=False,
    )
    return "sha256:" + hashlib.sha256(canonical_json_bytes(page_payload)).hexdigest()


def write_source_snapshot(
    data_root: str | os.PathLike[str],
    document_id: str,
    processing_fingerprint: str,
    source: BaseModel | Mapping[str, object],
) -> Path:
    relative = f"{_stage_relative_directory(document_id, processing_fingerprint)}/source.json"
    return _atomic_write(
        data_root,
        relative,
        _canonical_payload(source),
        max_bytes=_MAX_SMALL_JSON_BYTES,
        limit_label="8 MiB",
    )


def write_staged_page(
    data_root: str | os.PathLike[str],
    document_id: str,
    staged_page: StagedPage,
) -> Path:
    if staged_page.page.documentId != document_id:
        raise StagingError("staged page documentId does not match document_id")
    if _page_artifact_hash(staged_page) != staged_page.pageArtifactHash:
        raise StagingError("staged page pageArtifactHash does not match page")
    relative = (
        f"{_stage_relative_directory(document_id, staged_page.processingFingerprint)}/"
        f"pages/{staged_page.page.logicalPageNumber:06d}.json"
    )
    return _atomic_write(
        data_root,
        relative,
        _canonical_payload(staged_page),
        max_bytes=_MAX_SMALL_JSON_BYTES,
        limit_label="8 MiB",
    )


def load_reusable_staged_page(
    data_root: str | os.PathLike[str],
    document_id: str,
    logical_page_number: int,
    *,
    page_artifact_hash: str | None = None,
    processing_fingerprint: str,
    canonical_pdf_sha256: str,
    page_inventory_sha256: str,
    on_corrupt: Callable[[str], None] | None = None,
) -> StagedPage | None:
    paths = staging_paths(data_root, document_id, processing_fingerprint)
    relative = paths.page(logical_page_number).relative_to(Path(data_root)).as_posix()
    try:
        data = _read_regular_file(
            data_root,
            relative,
            max_bytes=_MAX_SMALL_JSON_BYTES,
            limit_label="8 MiB",
        )
        staged = _decode_model(data, StagedPage, "staged page")
    except _InvalidArtifact as exc:
        if on_corrupt is not None:
            on_corrupt(str(exc))
        return None
    computed_hash = _page_artifact_hash(staged)
    if computed_hash != staged.pageArtifactHash:
        if on_corrupt is not None:
            on_corrupt("staged page pageArtifactHash does not match page")
        return None
    if (
        staged.processingFingerprint != processing_fingerprint
        or staged.canonicalPdfSha256 != canonical_pdf_sha256
        or staged.pageInventorySha256 != page_inventory_sha256
        or staged.page.documentId != document_id
        or staged.page.logicalPageNumber != logical_page_number
    ):
        return None
    if page_artifact_hash is not None and staged.pageArtifactHash != page_artifact_hash:
        return None
    return staged


def write_prepared_document(
    data_root: str | os.PathLike[str],
    prepared_document: PreparedDocument,
) -> Path:
    relative = (
        f"{_stage_relative_directory(prepared_document.metadata.documentId, prepared_document.processingFingerprint)}/"
        "prepared-document.json"
    )
    return _atomic_write(
        data_root,
        relative,
        _canonical_payload(prepared_document),
        max_bytes=_MAX_PREPARED_BYTES,
        limit_label="128 MiB",
    )


def load_prepared_document(
    data_root: str | os.PathLike[str],
    relative_path: str | os.PathLike[str],
) -> PreparedDocument:
    try:
        data = _read_regular_file(
            data_root,
            relative_path,
            max_bytes=_MAX_PREPARED_BYTES,
            limit_label="128 MiB",
        )
        return _decode_model(data, PreparedDocument, "prepared document")
    except _InvalidArtifact as exc:
        raise StagingError(str(exc)) from exc


def write_evaluation_sample(
    data_root: str | os.PathLike[str],
    sample: OcrEvaluationSample,
) -> Path:
    relative = (
        f"{_stage_relative_directory(sample.metadata.documentId, sample.processingFingerprint)}/"
        f"evaluation-samples/{_sha256_hex(sample.sampleHash, 'sample_hash')}.json"
    )
    return _atomic_write(
        data_root,
        relative,
        _canonical_payload(sample),
        max_bytes=_MAX_SAMPLE_BYTES,
        limit_label="32 MiB",
    )


def load_evaluation_sample(
    data_root: str | os.PathLike[str],
    relative_path: str | os.PathLike[str],
) -> OcrEvaluationSample:
    try:
        data = _read_regular_file(
            data_root,
            relative_path,
            max_bytes=_MAX_SAMPLE_BYTES,
            limit_label="32 MiB",
        )
        return _decode_model(data, OcrEvaluationSample, "OCR evaluation sample")
    except _InvalidArtifact as exc:
        raise StagingError(str(exc)) from exc


def write_preparation_report(
    data_root: str | os.PathLike[str],
    report: PreparationReport,
) -> Path:
    relative = (
        f"{_stage_relative_directory(report.documentId, report.processingFingerprint)}/"
        "preparation-report.json"
    )
    if report.stageRelativePath != relative:
        raise StagingError("report stageRelativePath does not match derived staging path")
    return _atomic_write(
        data_root,
        relative,
        _canonical_payload(report),
        max_bytes=_MAX_SMALL_JSON_BYTES,
        limit_label="8 MiB",
    )
