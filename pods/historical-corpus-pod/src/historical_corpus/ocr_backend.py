from __future__ import annotations

import hashlib
import importlib.metadata
import json
import math
import os
import stat
import sys
import tempfile
from collections.abc import Callable, Mapping, Sequence
from numbers import Integral, Real
from pathlib import Path, PurePosixPath
from typing import Any

import numpy as np
from pydantic import ValidationError

from .ingest_models import (
    ExtractedLineCandidate,
    ModelLock,
    ModelLockEntry,
    ModelLockFile,
)


PADDLE_OCR_VERSION = "3.7.0"
PADDLE_X_VERSION = "3.7.2"
TRANSFORMERS_VERSION = "5.16.1"
OCR_ENGINE = "transformers"
OCR_DEVICE = "cpu"

DETECTION_MODEL_NAME = "PP-OCRv6_medium_det"
RECOGNITION_MODEL_NAME = "PP-OCRv6_medium_rec"
TEXTLINE_ORIENTATION_MODEL_NAME = "PP-LCNet_x1_0_textline_ori"

MODEL_CACHE_RELATIVE_PATHS = {
    DETECTION_MODEL_NAME: f"official_models/{DETECTION_MODEL_NAME}_safetensors",
    RECOGNITION_MODEL_NAME: f"official_models/{RECOGNITION_MODEL_NAME}_safetensors",
    TEXTLINE_ORIENTATION_MODEL_NAME: (
        f"official_models/{TEXTLINE_ORIENTATION_MODEL_NAME}_safetensors"
    ),
}

_MAX_LOCK_BYTES = 2 * 1024 * 1024
_HASH_BLOCK_SIZE = 1024 * 1024
_VERIFIED_CONSTRUCTION = object()


class OcrBackendError(RuntimeError):
    pass


def _relative_parts(value: str) -> tuple[str, ...]:
    if not isinstance(value, str) or not value or "\x00" in value:
        raise OcrBackendError("model path must be a non-empty relative POSIX path")
    if "\\" in value or "%" in value or value.startswith("/"):
        raise OcrBackendError("model path must be a safe relative POSIX path")
    path = PurePosixPath(value)
    if path.is_absolute() or not path.parts:
        raise OcrBackendError("model path must be relative")
    if any(part in {"", ".", ".."} for part in path.parts):
        raise OcrBackendError("model path contains an unsafe segment")
    if path.as_posix() != value:
        raise OcrBackendError("model path must use canonical POSIX syntax")
    return path.parts


def _checked_root(model_cache_root: str | os.PathLike[str]) -> Path:
    root = Path(model_cache_root)
    try:
        root_stat = root.lstat()
    except OSError as exc:
        raise OcrBackendError("model cache root is unavailable") from exc
    if stat.S_ISLNK(root_stat.st_mode) or not stat.S_ISDIR(root_stat.st_mode):
        raise OcrBackendError("model cache root must be a real directory")
    try:
        return root.resolve(strict=True)
    except OSError as exc:
        raise OcrBackendError("model cache root cannot be resolved") from exc


def _walk_existing_path(root: Path, relative_path: str) -> Path:
    current = root
    parts = _relative_parts(relative_path)
    for index, part in enumerate(parts):
        current = current / part
        try:
            current_stat = current.lstat()
        except OSError as exc:
            raise OcrBackendError(f"required model path is unavailable: {relative_path}") from exc
        if stat.S_ISLNK(current_stat.st_mode):
            raise OcrBackendError(f"symlinks are forbidden in model paths: {relative_path}")
        if index < len(parts) - 1 and not stat.S_ISDIR(current_stat.st_mode):
            raise OcrBackendError(f"model path parent is not a directory: {relative_path}")
    return current


def _checked_directory(root: Path, relative_path: str) -> Path:
    path = _walk_existing_path(root, relative_path)
    try:
        path_stat = path.lstat()
    except OSError as exc:
        raise OcrBackendError(f"model directory is unavailable: {relative_path}") from exc
    if not stat.S_ISDIR(path_stat.st_mode):
        raise OcrBackendError(f"model path is not a directory: {relative_path}")
    return path


def _ensure_safe_parent(root: Path, relative_path: str) -> Path:
    parts = _relative_parts(relative_path)
    current = root
    for part in parts[:-1]:
        current = current / part
        try:
            current.mkdir(mode=0o700)
        except FileExistsError:
            pass
        except OSError as exc:
            raise OcrBackendError("model lock parent cannot be created") from exc
        try:
            current_stat = current.lstat()
        except OSError as exc:
            raise OcrBackendError("model lock parent cannot be inspected") from exc
        if stat.S_ISLNK(current_stat.st_mode) or not stat.S_ISDIR(current_stat.st_mode):
            raise OcrBackendError("model lock parent must be a real directory")
    return current


def _open_regular_file(path: Path, *, maximum_bytes: int | None = None) -> int:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise OcrBackendError(f"cannot open required regular file: {path.name}") from exc
    try:
        file_stat = os.fstat(descriptor)
        if not stat.S_ISREG(file_stat.st_mode):
            raise OcrBackendError(f"required path is not a regular file: {path.name}")
        if file_stat.st_size < 1:
            raise OcrBackendError(f"required file is empty: {path.name}")
        if maximum_bytes is not None and file_stat.st_size > maximum_bytes:
            raise OcrBackendError(f"required file exceeds its size limit: {path.name}")
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _read_bounded_regular_file(path: Path, maximum_bytes: int) -> bytes:
    descriptor = _open_regular_file(path, maximum_bytes=maximum_bytes)
    try:
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(descriptor, min(_HASH_BLOCK_SIZE, maximum_bytes + 1 - total))
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if total > maximum_bytes:
                raise OcrBackendError(f"required file exceeds its size limit: {path.name}")
        return b"".join(chunks)
    finally:
        os.close(descriptor)


def _hash_regular_file(path: Path) -> tuple[int, str]:
    descriptor = _open_regular_file(path)
    digest = hashlib.sha256()
    try:
        before = os.fstat(descriptor)
        while True:
            chunk = os.read(descriptor, _HASH_BLOCK_SIZE)
            if not chunk:
                break
            digest.update(chunk)
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    identity_before = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
    identity_after = (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
    if identity_before != identity_after:
        raise OcrBackendError(f"model file changed while hashing: {path.name}")
    return before.st_size, f"sha256:{digest.hexdigest()}"


def _enumerate_model_files(model_dir: Path) -> list[tuple[str, Path]]:
    files: list[tuple[str, Path]] = []
    try:
        iterator = os.walk(model_dir, topdown=True, followlinks=False)
        for directory, directory_names, file_names in iterator:
            directory_path = Path(directory)
            for name in directory_names:
                child = directory_path / name
                child_stat = child.lstat()
                if stat.S_ISLNK(child_stat.st_mode) or not stat.S_ISDIR(child_stat.st_mode):
                    raise OcrBackendError("model directories must not contain symlinks")
            if directory_path == model_dir:
                directory_names[:] = [name for name in directory_names if name != ".cache"]
            for name in file_names:
                child = directory_path / name
                child_stat = child.lstat()
                if stat.S_ISLNK(child_stat.st_mode) or not stat.S_ISREG(child_stat.st_mode):
                    raise OcrBackendError("model directories may contain only regular files")
                relative_path = child.relative_to(model_dir).as_posix()
                _relative_parts(relative_path)
                files.append((relative_path, child))
    except OcrBackendError:
        raise
    except OSError as exc:
        raise OcrBackendError("model directory cannot be inspected") from exc
    files.sort(key=lambda item: item[0])
    if not files:
        raise OcrBackendError("model directory contains no files")
    return files


def _validate_closed_lock(model_lock: ModelLock) -> None:
    if (
        model_lock.schemaVersion != 1
        or model_lock.paddleOcrVersion != PADDLE_OCR_VERSION
        or model_lock.paddleXVersion != PADDLE_X_VERSION
        or model_lock.transformersVersion != TRANSFORMERS_VERSION
        or model_lock.engine != OCR_ENGINE
    ):
        raise OcrBackendError("model lock software configuration is unsupported")
    actual_paths = {model.name: model.cacheRelativePath for model in model_lock.models}
    if actual_paths != MODEL_CACHE_RELATIVE_PATHS:
        raise OcrBackendError("model lock does not contain the exact required models")


def verify_model_lock(
    model_cache_root: str | os.PathLike[str],
    model_lock: ModelLock,
) -> dict[str, Path]:
    _validate_closed_lock(model_lock)
    root = _checked_root(model_cache_root)
    resolved: dict[str, Path] = {}
    for model in model_lock.models:
        model_dir = _checked_directory(root, model.cacheRelativePath)
        actual_files = _enumerate_model_files(model_dir)
        expected_paths = [item.relativePath for item in model.files]
        if [relative for relative, _ in actual_files] != expected_paths:
            raise OcrBackendError(f"model directory contents changed: {model.name}")
        for expected, (relative_path, file_path) in zip(model.files, actual_files, strict=True):
            if expected.relativePath != relative_path:
                raise OcrBackendError(f"model file path changed: {model.name}")
            size, sha256 = _hash_regular_file(file_path)
            if size != expected.sizeBytes or sha256 != expected.sha256:
                raise OcrBackendError(f"model file bytes changed: {model.name}/{relative_path}")
        resolved[model.name] = model_dir
    return resolved


def load_model_lock(
    model_cache_root: str | os.PathLike[str],
    lock_relative_path: str,
) -> ModelLock:
    root = _checked_root(model_cache_root)
    lock_path = _walk_existing_path(root, lock_relative_path)
    payload = _read_bounded_regular_file(lock_path, _MAX_LOCK_BYTES)
    try:
        model_lock = ModelLock.model_validate_json(payload)
    except (ValidationError, ValueError, TypeError) as exc:
        raise OcrBackendError("model lock is invalid") from exc
    _validate_closed_lock(model_lock)
    return model_lock


def _common_factory_kwargs() -> dict[str, object]:
    return {
        "text_detection_model_name": DETECTION_MODEL_NAME,
        "text_recognition_model_name": RECOGNITION_MODEL_NAME,
        "textline_orientation_model_name": TEXTLINE_ORIENTATION_MODEL_NAME,
        "engine": OCR_ENGINE,
        "device": OCR_DEVICE,
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": True,
    }


def _default_factory(**kwargs: object) -> object:
    from paddleocr import PaddleOCR

    return PaddleOCR(**kwargs)


def _as_array(value: object, field_name: str) -> list[object]:
    if isinstance(value, np.ndarray):
        if value.ndim == 0:
            raise OcrBackendError(f"OCR field {field_name} must be an array")
        return list(value)
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return list(value)
    raise OcrBackendError(f"OCR field {field_name} must be an array")


def _is_real_number(value: object) -> bool:
    return not isinstance(value, (bool, np.bool_)) and isinstance(
        value, (Real, np.integer, np.floating)
    )


def _parse_polygon(value: object) -> list[list[float]]:
    points = _as_array(value, "rec_polys item")
    if len(points) != 4:
        raise OcrBackendError("OCR polygon must contain exactly four points")
    parsed: list[list[float]] = []
    for point in points:
        coordinates = _as_array(point, "rec_polys point")
        if len(coordinates) != 2:
            raise OcrBackendError("OCR polygon point must contain two coordinates")
        converted: list[float] = []
        for coordinate in coordinates:
            if not _is_real_number(coordinate):
                raise OcrBackendError("OCR polygon coordinate must be numeric")
            number = float(coordinate)
            if not math.isfinite(number) or number < 0:
                raise OcrBackendError("OCR polygon coordinate is invalid")
            converted.append(number)
        parsed.append(converted)
    return parsed


def _parse_page_results(results: object) -> list[ExtractedLineCandidate]:
    pages = _as_array(results, "page results")
    if len(pages) != 1 or not isinstance(pages[0], Mapping):
        raise OcrBackendError("OCR must return exactly one page mapping")
    page = pages[0]
    recognition_field_names = ("rec_texts", "rec_scores", "rec_polys")
    try:
        recognition_arrays = {name: _as_array(page[name], name) for name in recognition_field_names}
    except KeyError as exc:
        raise OcrBackendError("OCR result is missing a required field") from exc
    recognition_lengths = {len(recognition_arrays[name]) for name in recognition_field_names}
    if len(recognition_lengths) != 1:
        raise OcrBackendError("OCR recognition arrays must have identical lengths")
    if recognition_lengths == {0}:
        return []

    detection_field_names = ("dt_polys", "textline_orientation_angles")
    try:
        detection_arrays = {name: _as_array(page[name], name) for name in detection_field_names}
    except KeyError as exc:
        raise OcrBackendError("OCR result is missing a required field") from exc
    if len(detection_arrays["dt_polys"]) != len(detection_arrays["textline_orientation_angles"]):
        raise OcrBackendError("OCR detection arrays must have identical lengths")

    dt_polys_parsed: list[list[list[float]]] = []
    for dt_poly in detection_arrays["dt_polys"]:
        dt_polys_parsed.append(_parse_polygon(dt_poly))

    dt_orientations: list[int] = []
    for orientation in detection_arrays["textline_orientation_angles"]:
        if isinstance(orientation, (bool, np.bool_)) or not isinstance(
            orientation, (Integral, np.integer)
        ):
            raise OcrBackendError("OCR orientation must be a class ID")
        orientation_class = int(orientation)
        if orientation_class not in (0, 1):
            raise OcrBackendError("OCR orientation class must be 0 or 1")
        dt_orientations.append(orientation_class)

    used: list[bool] = [False] * len(dt_polys_parsed)
    candidates: list[ExtractedLineCandidate] = []
    for text, score, polygon in zip(
        recognition_arrays["rec_texts"],
        recognition_arrays["rec_scores"],
        recognition_arrays["rec_polys"],
        strict=True,
    ):
        if not isinstance(text, str) or not text:
            raise OcrBackendError("OCR text must be a non-empty string")
        if not _is_real_number(score):
            raise OcrBackendError("OCR confidence must be numeric")
        confidence = float(score)
        if not math.isfinite(confidence) or not 0.0 <= confidence <= 1.0:
            raise OcrBackendError("OCR confidence must be finite and within 0..1")
        rec_polygon = _parse_polygon(polygon)
        matched_index = -1
        for i, dt_poly in enumerate(dt_polys_parsed):
            if not used[i] and dt_poly == rec_polygon:
                matched_index = i
                break
        if matched_index == -1:
            raise OcrBackendError("OCR recognition polygon does not match any unused detection polygon")
        used[matched_index] = True
        try:
            candidates.append(
                ExtractedLineCandidate(
                    originalText=text,
                    confidence=confidence,
                    polygon=rec_polygon,
                    correction180=dt_orientations[matched_index] * 180,
                )
            )
        except (ValidationError, ValueError, TypeError) as exc:
            raise OcrBackendError("OCR line candidate is invalid") from exc
    return candidates


def _close_engine(engine: object) -> None:
    close = getattr(engine, "close", None)
    if callable(close):
        close()


def _build_lock(
    root: Path,
    package_version: Callable[[str], str],
) -> ModelLock:
    try:
        versions = {name: package_version(name) for name in VERSIONS_BY_FIELD.values()}
    except Exception as exc:
        raise OcrBackendError("required OCR package version is unavailable") from exc
    if versions != {
        "paddleocr": PADDLE_OCR_VERSION,
        "paddlex": PADDLE_X_VERSION,
        "transformers": TRANSFORMERS_VERSION,
    }:
        raise OcrBackendError("installed OCR package versions do not match the contract")

    entries: list[ModelLockEntry] = []
    for model_name in sorted(MODEL_CACHE_RELATIVE_PATHS):
        relative_model_path = MODEL_CACHE_RELATIVE_PATHS[model_name]
        model_dir = _checked_directory(root, relative_model_path)
        files: list[ModelLockFile] = []
        for relative_file_path, file_path in _enumerate_model_files(model_dir):
            size, sha256 = _hash_regular_file(file_path)
            files.append(
                ModelLockFile(
                    relativePath=relative_file_path,
                    sizeBytes=size,
                    sha256=sha256,
                )
            )
        entries.append(
            ModelLockEntry(
                name=model_name,
                cacheRelativePath=relative_model_path,
                files=files,
            )
        )
    return ModelLock(
        schemaVersion=1,
        paddleOcrVersion=versions["paddleocr"],
        paddleXVersion=versions["paddlex"],
        transformersVersion=versions["transformers"],
        engine=OCR_ENGINE,
        models=entries,
    )


VERSIONS_BY_FIELD = {
    "paddleOcrVersion": "paddleocr",
    "paddleXVersion": "paddlex",
    "transformersVersion": "transformers",
}


def _write_model_lock(root: Path, lock_relative_path: str, model_lock: ModelLock) -> None:
    parent = _ensure_safe_parent(root, lock_relative_path)
    name = _relative_parts(lock_relative_path)[-1]
    destination = parent / name
    if destination.exists() or destination.is_symlink():
        try:
            destination_stat = destination.lstat()
        except OSError as exc:
            raise OcrBackendError("existing model lock cannot be inspected") from exc
        if stat.S_ISLNK(destination_stat.st_mode) or not stat.S_ISREG(destination_stat.st_mode):
            raise OcrBackendError("existing model lock must be a regular file")
    payload = json.dumps(
        model_lock.model_dump(mode="json"),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=parent,
            prefix=f".{name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            os.fchmod(temporary.fileno(), 0o600)
            temporary.write(payload)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, destination)
        temporary_path = None
        directory_descriptor = os.open(parent, os.O_RDONLY | getattr(os, "O_CLOEXEC", 0))
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    except OcrBackendError:
        raise
    except OSError as exc:
        raise OcrBackendError("model lock cannot be written atomically") from exc
    finally:
        if temporary_path is not None:
            try:
                temporary_path.unlink()
            except FileNotFoundError:
                pass


def prefetch_models(
    model_cache_root: str | os.PathLike[str],
    lock_relative_path: str,
    *,
    factory: Callable[..., object] | None = None,
    package_version: Callable[[str], str] = importlib.metadata.version,
) -> ModelLock:
    root = _checked_root(model_cache_root)
    build = factory or _default_factory
    engine: object | None = None
    try:
        engine = build(**_common_factory_kwargs())
        predict = getattr(engine, "predict", None)
        if not callable(predict):
            raise OcrBackendError("PaddleOCR factory returned an invalid engine")
        minimal_image = np.full((32, 32, 3), 255, dtype=np.uint8)
        _parse_page_results(predict(minimal_image))
    except OcrBackendError:
        raise
    except Exception as exc:
        raise OcrBackendError("OCR model prefetch or smoke inference failed") from exc
    finally:
        primary_error = sys.exception()
        if engine is not None:
            try:
                _close_engine(engine)
            except Exception as exc:
                if primary_error is None:
                    raise OcrBackendError("OCR engine failed to close after prefetch") from exc

    model_lock = _build_lock(root, package_version)
    verify_model_lock(root, model_lock)
    _write_model_lock(root, lock_relative_path, model_lock)
    return model_lock


class PpOcrV6Backend:
    def __init__(self, engine: object, *, _construction_token: object | None = None) -> None:
        if _construction_token is not _VERIFIED_CONSTRUCTION:
            raise OcrBackendError("OCR backend must be opened from a verified model lock")
        self._engine: object | None = engine

    @classmethod
    def open(
        cls,
        model_cache_root: str | os.PathLike[str],
        lock_relative_path: str,
        *,
        factory: Callable[..., object] | None = None,
    ) -> PpOcrV6Backend:
        model_lock = load_model_lock(model_cache_root, lock_relative_path)
        resolved = verify_model_lock(model_cache_root, model_lock)
        kwargs = _common_factory_kwargs()
        kwargs.update(
            text_detection_model_dir=str(resolved[DETECTION_MODEL_NAME]),
            text_recognition_model_dir=str(resolved[RECOGNITION_MODEL_NAME]),
            textline_orientation_model_dir=str(resolved[TEXTLINE_ORIENTATION_MODEL_NAME]),
        )
        build = factory or _default_factory
        try:
            engine = build(**kwargs)
        except Exception as exc:
            raise OcrBackendError("verified OCR engine could not be constructed") from exc
        if engine is None or not callable(getattr(engine, "predict", None)):
            try:
                if engine is not None:
                    _close_engine(engine)
            finally:
                raise OcrBackendError("PaddleOCR factory returned an invalid engine")
        return cls(engine, _construction_token=_VERIFIED_CONSTRUCTION)

    def extract_lines(self, image: np.ndarray) -> list[ExtractedLineCandidate]:
        if self._engine is None:
            raise OcrBackendError("OCR backend is closed")
        try:
            return _parse_page_results(self._engine.predict(image))
        except OcrBackendError:
            raise
        except Exception as exc:
            raise OcrBackendError("OCR inference failed") from exc

    def close(self) -> None:
        engine = self._engine
        if engine is None:
            return
        self._engine = None
        try:
            _close_engine(engine)
        except Exception as exc:
            raise OcrBackendError("OCR engine failed to close") from exc

    def __enter__(self) -> PpOcrV6Backend:
        if self._engine is None:
            raise OcrBackendError("OCR backend is closed")
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        self.close()
