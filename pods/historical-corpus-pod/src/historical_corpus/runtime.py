from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path
from typing import Literal

from historical_corpus.backends import (
    DeterministicEmbeddingProvider,
    DeterministicReranker,
)
from historical_corpus.qwen_models import QwenEmbeddingProvider, QwenReranker
from historical_corpus.service import HistoricalCorpusService
from historical_corpus.turbovec_index import TurboVecIndex

_TRUE_VALUES = {"1", "true", "yes", "on"}
_FALSE_VALUES = {"0", "false", "no", "off"}


def _read_text(
    environment: Mapping[str, str],
    name: str,
    default: str,
) -> str:
    value = environment.get(name, default)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a non-empty string")
    return value.strip()


def _read_boolean(
    environment: Mapping[str, str],
    name: str,
    default: bool,
) -> bool:
    raw_default = "true" if default else "false"
    value = _read_text(environment, name, raw_default).lower()
    if value in _TRUE_VALUES:
        return True
    if value in _FALSE_VALUES:
        return False
    raise ValueError(f"{name} must be a boolean value")


def _read_integer(
    environment: Mapping[str, str],
    name: str,
    default: int,
    *,
    minimum: int,
    maximum: int,
) -> int:
    raw = environment.get(name, str(default))
    try:
        value = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


def build_service_from_env(
    environment: Mapping[str, str] | None = None,
    *,
    startup_policy: Literal["verify", "repair"] = "verify",
) -> HistoricalCorpusService:
    if startup_policy not in ("verify", "repair"):
        raise ValueError("startup_policy must be verify or repair")
    values = os.environ if environment is None else environment

    backend = _read_text(
        values,
        "HISTORICAL_CORPUS_MODEL_BACKEND",
        "qwen",
    ).lower()
    allow_deterministic = _read_boolean(
        values,
        "HISTORICAL_CORPUS_ALLOW_DETERMINISTIC",
        False,
    )
    batch_size = _read_integer(
        values,
        "HISTORICAL_CORPUS_MODEL_BATCH_SIZE",
        8,
        minimum=1,
        maximum=64,
    )
    max_length = _read_integer(
        values,
        "HISTORICAL_CORPUS_MODEL_MAX_LENGTH",
        8192,
        minimum=1,
        maximum=32768,
    )
    try:
        bit_width = _read_integer(
            values,
            "HISTORICAL_CORPUS_TURBOVEC_BIT_WIDTH",
            4,
            minimum=2,
            maximum=4,
        )
    except ValueError as exc:
        raise ValueError("TurboVec bit width must be the integer 2, 3, or 4") from exc

    if backend == "qwen":
        device = values.get("HISTORICAL_CORPUS_DEVICE") or None
        embedding_provider = QwenEmbeddingProvider(
            model_id=_read_text(
                values,
                "HISTORICAL_CORPUS_EMBEDDING_MODEL",
                "Qwen/Qwen3-Embedding-0.6B",
            ),
            batch_size=batch_size,
            max_length=max_length,
            device=device,
        )
        reranker = QwenReranker(
            model_id=_read_text(
                values,
                "HISTORICAL_CORPUS_RERANKER_MODEL",
                "Qwen/Qwen3-Reranker-0.6B",
            ),
            batch_size=batch_size,
            max_length=max_length,
            device=device,
        )
    elif backend == "deterministic":
        if not allow_deterministic:
            raise ValueError(
                "deterministic backend requires "
                "HISTORICAL_CORPUS_ALLOW_DETERMINISTIC=true"
            )
        embedding_provider = DeterministicEmbeddingProvider(dimension=1024)
        reranker = DeterministicReranker()
    else:
        raise ValueError(
            "HISTORICAL_CORPUS_MODEL_BACKEND backend must be qwen or deterministic"
        )

    data_dir = Path(
        _read_text(values, "HISTORICAL_CORPUS_DATA_DIR", "/data")
    )
    if data_dir.exists() and not data_dir.is_dir():
        raise ValueError("HISTORICAL_CORPUS_DATA_DIR must be a directory")
    data_dir.mkdir(parents=True, exist_ok=True)

    vector_index = TurboVecIndex(
        path=data_dir / "index.tvim",
        dimension=embedding_provider.dimension,
        bit_width=bit_width,
    )
    return HistoricalCorpusService(
        db_path=data_dir / "corpus.sqlite3",
        vector_index=vector_index,
        embedding_provider=embedding_provider,
        reranker=reranker,
        startup_policy=startup_policy,
        vector_index_backend="turbovec",
        vector_index_bit_width=bit_width,
    )
