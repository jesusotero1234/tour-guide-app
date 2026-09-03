from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from historical_corpus.ingest_models import ExtractedLineCandidate, ModelLock
from historical_corpus.ocr_backend import (
    OcrBackendError,
    PpOcrV6Backend,
    load_model_lock,
    prefetch_models,
    verify_model_lock,
)


DETECTION_MODEL = "PP-OCRv6_medium_det"
RECOGNITION_MODEL = "PP-OCRv6_medium_rec"
ORIENTATION_MODEL = "PP-LCNet_x1_0_textline_ori"
MODEL_PATHS = {
    name: f"official_models/{name}_safetensors"
    for name in (DETECTION_MODEL, RECOGNITION_MODEL, ORIENTATION_MODEL)
}
LOCK_PATH = "ppocrv6-medium-transformers/model-lock.json"
VERSIONS = {
    "paddleocr": "3.7.0",
    "paddlex": "3.7.2",
    "transformers": "5.16.1",
}


def _package_version(name: str) -> str:
    return VERSIONS[name]


def _valid_result() -> dict[str, object]:
    return {
        "rec_texts": ["Málaga", "MADOZ"],
        "rec_scores": [0.75, 1.0],
        "rec_polys": [
            [[1, 2], [11, 2], [11, 7], [1, 7]],
            np.array([[2.5, 8], [12, 8], [12, 13], [2.5, 13]]),
        ],
        "dt_polys": [
            [[1, 2], [11, 2], [11, 7], [1, 7]],
            [[2.5, 8], [12, 8], [12, 13], [2.5, 13]],
        ],
        "textline_orientation_angles": np.array([0, 1]),
    }


class FakeEngine:
    def __init__(self, result: object | None = None) -> None:
        self.result = [_valid_result()] if result is None else result
        self.inputs: list[object] = []
        self.close_calls = 0

    def predict(self, image: object) -> object:
        self.inputs.append(image)
        return self.result

    def close(self) -> None:
        self.close_calls += 1


def _factory(engine: FakeEngine, calls: list[dict[str, Any]]):
    def build(**kwargs: Any) -> FakeEngine:
        calls.append(kwargs)
        return engine

    return build


def _populate_model_cache(root: Path) -> dict[str, Path]:
    paths: dict[str, Path] = {}
    for index, (name, relative_path) in enumerate(sorted(MODEL_PATHS.items())):
        model_dir = root / relative_path
        model_dir.mkdir(parents=True)
        (model_dir / "config.json").write_bytes(f"config-{index}".encode())
        nested = model_dir / "weights"
        nested.mkdir()
        (nested / "model.safetensors").write_bytes(f"weights-{name}".encode())
        paths[name] = model_dir
    return paths


def _prefetch(root: Path) -> tuple[ModelLock, FakeEngine, list[dict[str, Any]]]:
    _populate_model_cache(root)
    engine = FakeEngine(result=[{
        "rec_texts": [],
        "rec_scores": [],
        "rec_polys": [],
        "textline_orientation_angles": [0],
    }])
    calls: list[dict[str, Any]] = []
    lock = prefetch_models(
        root,
        LOCK_PATH,
        factory=_factory(engine, calls),
        package_version=_package_version,
    )
    return lock, engine, calls


def _open_backend(
    root: Path,
    *,
    result: object | None = None,
) -> tuple[PpOcrV6Backend, FakeEngine, list[dict[str, Any]]]:
    _prefetch(root)
    engine = FakeEngine(result=result)
    calls: list[dict[str, Any]] = []
    backend = PpOcrV6Backend.open(root, LOCK_PATH, factory=_factory(engine, calls))
    return backend, engine, calls


def _expected_common_kwargs() -> dict[str, object]:
    return {
        "text_detection_model_name": DETECTION_MODEL,
        "text_recognition_model_name": RECOGNITION_MODEL,
        "textline_orientation_model_name": ORIENTATION_MODEL,
        "engine": "transformers",
        "device": "cpu",
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": True,
    }


def test_prefetch_initializes_all_models_and_writes_atomic_lock(tmp_path: Path) -> None:
    model_paths = _populate_model_cache(tmp_path)
    transient_lock = (
        model_paths[DETECTION_MODEL]
        / ".cache"
        / "huggingface"
        / "download"
        / "model.safetensors.lock"
    )
    transient_lock.parent.mkdir(parents=True)
    transient_lock.touch()
    engine = FakeEngine(result=[{
        "rec_texts": [],
        "rec_scores": [],
        "rec_polys": [],
        "textline_orientation_angles": [0],
    }])
    calls: list[dict[str, Any]] = []

    lock = prefetch_models(
        tmp_path,
        LOCK_PATH,
        factory=_factory(engine, calls),
        package_version=_package_version,
    )

    assert calls == [_expected_common_kwargs()]
    assert len(engine.inputs) == 1
    image = engine.inputs[0]
    assert isinstance(image, np.ndarray)
    assert image.dtype == np.uint8
    assert image.ndim == 3 and image.shape[2] == 3
    assert engine.close_calls == 1

    assert lock.schemaVersion == 1
    assert lock.paddleOcrVersion == "3.7.0"
    assert lock.paddleXVersion == "3.7.2"
    assert lock.transformersVersion == "5.16.1"
    assert lock.engine == "transformers"
    assert [model.name for model in lock.models] == sorted(MODEL_PATHS)
    assert {model.name: model.cacheRelativePath for model in lock.models} == MODEL_PATHS
    for model in lock.models:
        expected_files = sorted(
            path.relative_to(model_paths[model.name]).as_posix()
            for path in model_paths[model.name].rglob("*")
            if path.is_file()
            and ".cache" not in path.relative_to(model_paths[model.name]).parts
        )
        assert [item.relativePath for item in model.files] == expected_files
        for item in model.files:
            payload = (model_paths[model.name] / item.relativePath).read_bytes()
            assert item.sizeBytes == len(payload)
            assert item.sha256 == f"sha256:{hashlib.sha256(payload).hexdigest()}"

    lock_file = tmp_path / LOCK_PATH
    assert load_model_lock(tmp_path, LOCK_PATH) == lock
    assert (lock_file.stat().st_mode & 0o777) == 0o600
    assert list(lock_file.parent.iterdir()) == [lock_file]


def test_open_verifies_lock_then_uses_only_explicit_local_directories(tmp_path: Path) -> None:
    lock, _, _ = _prefetch(tmp_path)
    engine = FakeEngine()
    calls: list[dict[str, Any]] = []

    resolved = verify_model_lock(tmp_path, lock)
    backend = PpOcrV6Backend.open(
        tmp_path,
        LOCK_PATH,
        factory=_factory(engine, calls),
    )

    expected = _expected_common_kwargs()
    expected.update(
        text_detection_model_dir=str(resolved[DETECTION_MODEL]),
        text_recognition_model_dir=str(resolved[RECOGNITION_MODEL]),
        textline_orientation_model_dir=str(resolved[ORIENTATION_MODEL]),
    )
    assert calls == [expected]
    backend.close()


def test_extract_lines_parses_parallel_arrays_without_layout_decisions(tmp_path: Path) -> None:
    backend, engine, _ = _open_backend(tmp_path)
    image = np.zeros((20, 30, 3), dtype=np.uint8)

    lines = backend.extract_lines(image)

    assert engine.inputs == [image]
    assert lines == [
        ExtractedLineCandidate(
            originalText="Málaga",
            confidence=0.75,
            polygon=[[1, 2], [11, 2], [11, 7], [1, 7]],
            correction180=0,
        ),
        ExtractedLineCandidate(
            originalText="MADOZ",
            confidence=1.0,
            polygon=[[2.5, 8], [12, 8], [12, 13], [2.5, 13]],
            correction180=180,
        ),
    ]


def test_extract_lines_accepts_empty_parallel_arrays(tmp_path: Path) -> None:
    empty = {
        "rec_texts": [],
        "rec_scores": [],
        "rec_polys": [],
        "textline_orientation_angles": [],
    }
    backend, _, _ = _open_backend(tmp_path, result=[empty])
    assert backend.extract_lines(np.zeros((1, 1, 3), dtype=np.uint8)) == []


def test_extract_lines_maps_orientation_when_detection_filtered(tmp_path: Path) -> None:
    result = {
        "rec_texts": ["first", "third"],
        "rec_scores": [0.9, 0.8],
        "rec_polys": [
            [[1, 2], [11, 2], [11, 7], [1, 7]],
            [[21, 2], [31, 2], [31, 7], [21, 7]],
        ],
        "dt_polys": [
            [[1, 2], [11, 2], [11, 7], [1, 7]],
            [[11, 2], [21, 2], [21, 7], [11, 7]],
            [[21, 2], [31, 2], [31, 7], [21, 7]],
        ],
        "textline_orientation_angles": [0, 1, 1],
    }
    backend, _, _ = _open_backend(tmp_path, result=[result])
    lines = backend.extract_lines(np.zeros((1, 1, 3), dtype=np.uint8))
    assert [line.correction180 for line in lines] == [0, 180]


def test_extract_lines_rejects_rec_polygon_not_matching_detection(tmp_path: Path) -> None:
    result = {
        "rec_texts": ["text"],
        "rec_scores": [0.9],
        "rec_polys": [
            [[1, 2], [11, 2], [11, 7], [1, 7]],
        ],
        "dt_polys": [
            [[100, 100], [110, 100], [110, 105], [100, 105]],
        ],
        "textline_orientation_angles": [0],
    }
    backend, _, _ = _open_backend(tmp_path, result=[result])
    with pytest.raises(OcrBackendError):
        backend.extract_lines(np.zeros((1, 1, 3), dtype=np.uint8))


@pytest.mark.parametrize("result", [[], [{}, {}], [object()]])
def test_extract_lines_rejects_changed_page_result_contract(
    tmp_path: Path,
    result: object,
) -> None:
    backend, _, _ = _open_backend(tmp_path, result=result)
    with pytest.raises(OcrBackendError):
        backend.extract_lines(np.zeros((1, 1, 3), dtype=np.uint8))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("rec_texts", "text"),
        ("rec_scores", {"score": 1}),
        ("rec_polys", 1),
        ("dt_polys", 1),
        ("textline_orientation_angles", None),
    ],
)
def test_extract_lines_rejects_non_array_fields(
    tmp_path: Path,
    field: str,
    value: object,
) -> None:
    result = _valid_result()
    result[field] = value
    backend, _, _ = _open_backend(tmp_path, result=[result])
    with pytest.raises(OcrBackendError):
        backend.extract_lines(np.zeros((1, 1, 3), dtype=np.uint8))


def test_extract_lines_rejects_missing_or_differently_sized_arrays(tmp_path: Path) -> None:
    missing_rec = _valid_result()
    missing_rec.pop("rec_polys")
    missing_dt = _valid_result()
    missing_dt.pop("dt_polys")
    unequal_scores = _valid_result()
    unequal_scores["rec_scores"] = [0.5]
    unequal_dt = _valid_result()
    unequal_dt["dt_polys"] = [
        [[1, 2], [11, 2], [11, 7], [1, 7]],
    ]
    for index, result in enumerate((missing_rec, missing_dt, unequal_scores, unequal_dt)):
        backend, _, _ = _open_backend(tmp_path / str(index), result=[result])
        with pytest.raises(OcrBackendError):
            backend.extract_lines(np.zeros((1, 1, 3), dtype=np.uint8))


@pytest.mark.parametrize("value", ["", 7, None])
def test_extract_lines_rejects_invalid_text(tmp_path: Path, value: object) -> None:
    result = _valid_result()
    result["rec_texts"] = [value, "ok"]
    backend, _, _ = _open_backend(tmp_path, result=[result])
    with pytest.raises(OcrBackendError):
        backend.extract_lines(np.zeros((1, 1, 3), dtype=np.uint8))


@pytest.mark.parametrize("value", [True, "0.5", -0.1, 1.1, float("nan"), float("inf")])
def test_extract_lines_rejects_invalid_confidence(tmp_path: Path, value: object) -> None:
    result = _valid_result()
    result["rec_scores"] = [value, 1.0]
    backend, _, _ = _open_backend(tmp_path, result=[result])
    with pytest.raises(OcrBackendError):
        backend.extract_lines(np.zeros((1, 1, 3), dtype=np.uint8))


@pytest.mark.parametrize(
    "value",
    [
        [[0, 0], [1, 0], [1, 1]],
        [[0, 0], [1, 0], [1, 1], [0, 1], [2, 2]],
        [[0, 0], [1, 0], [1, 1], [-1, 1]],
        [[0, 0], [1, 0], [1, float("nan")], [0, 1]],
        [[0, 0], [1, 0], [1, 1], ["0", 1]],
    ],
)
def test_extract_lines_rejects_invalid_polygon(tmp_path: Path, value: object) -> None:
    result = _valid_result()
    result["rec_polys"] = [value, value]
    backend, _, _ = _open_backend(tmp_path, result=[result])
    with pytest.raises(OcrBackendError):
        backend.extract_lines(np.zeros((1, 1, 3), dtype=np.uint8))


@pytest.mark.parametrize("value", [True, "1", -1, 2, 180])
def test_extract_lines_rejects_invalid_orientation_class(tmp_path: Path, value: object) -> None:
    result = _valid_result()
    result["textline_orientation_angles"] = [value, 0]
    backend, _, _ = _open_backend(tmp_path, result=[result])
    with pytest.raises(OcrBackendError):
        backend.extract_lines(np.zeros((1, 1, 3), dtype=np.uint8))


@pytest.mark.parametrize("mutation", ["missing", "size", "hash", "extra"])
def test_open_rejects_missing_changed_or_extra_model_file_before_factory(
    tmp_path: Path,
    mutation: str,
) -> None:
    lock, _, _ = _prefetch(tmp_path)
    model_dir = tmp_path / lock.models[0].cacheRelativePath
    file_path = model_dir / lock.models[0].files[0].relativePath
    if mutation == "missing":
        file_path.unlink()
    elif mutation == "size":
        file_path.write_bytes(file_path.read_bytes() + b"x")
    elif mutation == "hash":
        payload = file_path.read_bytes()
        file_path.write_bytes(bytes([payload[0] ^ 1]) + payload[1:])
    else:
        (model_dir / "unlocked.bin").write_bytes(b"extra")
    calls: list[dict[str, Any]] = []

    with pytest.raises(OcrBackendError):
        PpOcrV6Backend.open(tmp_path, LOCK_PATH, factory=_factory(FakeEngine(), calls))
    assert calls == []


@pytest.mark.parametrize("target", ["lock", "model_dir", "model_file"])
def test_open_rejects_symlinks_before_factory(tmp_path: Path, target: str) -> None:
    lock, _, _ = _prefetch(tmp_path)
    if target == "lock":
        lock_path = tmp_path / LOCK_PATH
        payload = lock_path.read_bytes()
        real_path = tmp_path / "elsewhere.json"
        real_path.write_bytes(payload)
        lock_path.unlink()
        lock_path.symlink_to(real_path)
    elif target == "model_dir":
        model_dir = tmp_path / lock.models[0].cacheRelativePath
        moved = tmp_path / "moved-model"
        model_dir.rename(moved)
        model_dir.symlink_to(moved, target_is_directory=True)
    else:
        model_dir = tmp_path / lock.models[0].cacheRelativePath
        file_path = model_dir / lock.models[0].files[0].relativePath
        moved = tmp_path / "moved-weight"
        file_path.rename(moved)
        file_path.symlink_to(moved)
    calls: list[dict[str, Any]] = []

    with pytest.raises(OcrBackendError):
        PpOcrV6Backend.open(tmp_path, LOCK_PATH, factory=_factory(FakeEngine(), calls))
    assert calls == []


def test_load_model_lock_rejects_traversal_and_invalid_json(tmp_path: Path) -> None:
    tmp_path.mkdir(exist_ok=True)
    (tmp_path / "broken.json").write_text("{", encoding="utf-8")
    with pytest.raises(OcrBackendError):
        load_model_lock(tmp_path, "../model-lock.json")
    with pytest.raises(OcrBackendError):
        load_model_lock(tmp_path, "broken.json")


@pytest.mark.parametrize("mutation", ["extra_field", "missing_model", "extra_model", "wrong_path", "version"])
def test_load_model_lock_requires_exact_closed_configuration(
    tmp_path: Path,
    mutation: str,
) -> None:
    lock, _, _ = _prefetch(tmp_path)
    lock_path = tmp_path / LOCK_PATH
    data = lock.model_dump(mode="json")
    if mutation == "extra_field":
        data["unexpected"] = True
    elif mutation == "missing_model":
        data["models"] = data["models"][:-1]
    elif mutation == "extra_model":
        extra = dict(data["models"][0])
        extra["name"] = "unknown-model"
        extra["cacheRelativePath"] = "official_models/unknown-model"
        data["models"].append(extra)
        data["models"].sort(key=lambda item: item["name"])
    elif mutation == "wrong_path":
        data["models"][0]["cacheRelativePath"] = "official_models/wrong"
    else:
        data["paddleXVersion"] = "3.7.3"
    lock_path.write_text(json.dumps(data), encoding="utf-8")

    with pytest.raises(OcrBackendError):
        load_model_lock(tmp_path, LOCK_PATH)


def test_close_is_idempotent_and_disables_inference(tmp_path: Path) -> None:
    backend, engine, _ = _open_backend(tmp_path)
    backend.close()
    backend.close()
    assert engine.close_calls == 1
    with pytest.raises(OcrBackendError):
        backend.extract_lines(np.zeros((1, 1, 3), dtype=np.uint8))


def test_prefetch_close_failure_does_not_mask_primary_inference_failure(tmp_path: Path) -> None:
    _populate_model_cache(tmp_path)

    class FailingEngine:
        def __init__(self) -> None:
            self.close_calls = 0

        def predict(self, image: object) -> object:
            raise ValueError("primary inference failure")

        def close(self) -> None:
            self.close_calls += 1
            raise RuntimeError("secondary close failure")

    engine = FailingEngine()
    calls: list[dict[str, Any]] = []

    with pytest.raises(OcrBackendError) as exc_info:
        prefetch_models(
            tmp_path,
            LOCK_PATH,
            factory=_factory(engine, calls),
            package_version=_package_version,
        )

    error = exc_info.value
    assert "prefetch" in str(error).lower() or "smoke" in str(error).lower()
    assert isinstance(error.__cause__, ValueError)
    assert str(error.__cause__) == "primary inference failure"
    assert engine.close_calls == 1


def test_prefetch_close_failure_propagates_without_prior_inference_failure(tmp_path: Path) -> None:
    _populate_model_cache(tmp_path)

    class CloseOnlyFailingEngine:
        def __init__(self) -> None:
            self.close_calls = 0

        def predict(self, image: object) -> object:
            return [{
                "rec_texts": [],
                "rec_scores": [],
                "rec_polys": [],
                "textline_orientation_angles": [],
            }]

        def close(self) -> None:
            self.close_calls += 1
            raise RuntimeError("close only failure")

    engine = CloseOnlyFailingEngine()
    calls: list[dict[str, Any]] = []

    with pytest.raises(OcrBackendError) as exc_info:
        prefetch_models(
            tmp_path,
            LOCK_PATH,
            factory=_factory(engine, calls),
            package_version=_package_version,
        )

    error = exc_info.value
    assert "close" in str(error).lower()
    assert isinstance(error.__cause__, RuntimeError)
    assert str(error.__cause__) == "close only failure"
    assert engine.close_calls == 1
    assert not (tmp_path / LOCK_PATH).exists()
