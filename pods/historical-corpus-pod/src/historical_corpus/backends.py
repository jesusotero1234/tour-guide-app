from __future__ import annotations

import hashlib
import math
import re
import struct
import unicodedata
from numbers import Integral
from typing import Protocol, Sequence

import numpy as np

_UINT64_MAX = (1 << 64) - 1


class EmbeddingProvider(Protocol):
    model_id: str
    dimension: int

    def embed_documents(self, texts: Sequence[str]) -> np.ndarray:
        ...

    def embed_queries(self, texts: Sequence[str]) -> np.ndarray:
        ...


class Reranker(Protocol):
    model_id: str

    def rerank(self, query: str, documents: Sequence[str]) -> list[float]:
        ...


class VectorIndex(Protocol):
    dimension: int
    is_persistent: bool

    def upsert(self, ids: Sequence[int], vectors: np.ndarray) -> None:
        ...

    def remove(self, ids: Sequence[int]) -> None:
        ...

    def search(self, vector: np.ndarray, k: int, allowlist: set[int] | None = None) -> list[tuple[int, float]]:
        ...

    def count(self) -> int:
        ...

    def contains_ids(self, ids: Sequence[int]) -> set[int]:
        ...

    def replace_all(self, ids: Sequence[int], vectors: np.ndarray) -> None:
        ...

    def artifact_sha256(self) -> str:
        ...


def _normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _tokenize(text: str) -> list[str]:
    normalized = _normalize_text(text)
    if not normalized:
        return []
    return normalized.split()


def _hash_token(token: str, dimension: int) -> int:
    digest = hashlib.sha256(token.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") % dimension


class DeterministicEmbeddingProvider:
    def __init__(self, dimension: int = 1024) -> None:
        if dimension <= 0 or dimension % 8 != 0:
            raise ValueError("dimension must be positive and divisible by 8")
        self.model_id = "deterministic-embedding-v1"
        self.dimension = dimension

    def _embed_single(self, text: str) -> np.ndarray:
        vec = np.zeros(self.dimension, dtype=np.float32)
        tokens = _tokenize(text)
        for token in tokens:
            idx = _hash_token(token, self.dimension)
            vec[idx] += 1.0
        norm = float(np.linalg.norm(vec))
        if norm > 0:
            vec /= norm
        return vec

    def embed_documents(self, texts: Sequence[str]) -> np.ndarray:
        return np.stack([self._embed_single(t) for t in texts])

    def embed_queries(self, texts: Sequence[str]) -> np.ndarray:
        return np.stack([self._embed_single(t) for t in texts])


class DeterministicReranker:
    def __init__(self) -> None:
        self.model_id = "deterministic-reranker-v1"

    def rerank(self, query: str, documents: Sequence[str]) -> list[float]:
        query_tokens = set(_tokenize(query))
        scores: list[float] = []
        for doc in documents:
            doc_tokens = set(_tokenize(doc))
            if not doc_tokens:
                scores.append(0.0)
                continue
            overlap = len(query_tokens & doc_tokens)
            score = overlap / len(doc_tokens)
            scores.append(min(1.0, max(0.0, score)))
        return scores


class InMemoryVectorIndex:
    is_persistent = False

    def __init__(self, dimension: int = 1024) -> None:
        if dimension <= 0:
            raise ValueError("dimension must be positive")
        self.dimension = dimension
        self._vectors: dict[int, np.ndarray] = {}
        self._next_id = 1

    def upsert(self, ids: Sequence[int], vectors: np.ndarray) -> None:
        if len(ids) != len(vectors):
            raise ValueError("ids and vectors must have same length")
        for i, vec in zip(ids, vectors):
            if vec.shape != (self.dimension,):
                raise ValueError(f"vector must have shape ({self.dimension},)")
            if not np.all(np.isfinite(vec)):
                raise ValueError("vector must contain only finite values")
            self._vectors[int(i)] = vec.astype(np.float32)

    def remove(self, ids: Sequence[int]) -> None:
        for i in ids:
            self._vectors.pop(int(i), None)

    def search(self, vector: np.ndarray, k: int, allowlist: set[int] | None = None) -> list[tuple[int, float]]:
        if vector.shape != (self.dimension,):
            raise ValueError(f"vector must have shape ({self.dimension},)")
        if not np.all(np.isfinite(vector)):
            raise ValueError("vector must contain only finite values")
        vector = vector.astype(np.float32)
        candidates: list[tuple[int, float]] = []
        for vid, vec in self._vectors.items():
            if allowlist is not None and vid not in allowlist:
                continue
            dot = float(np.dot(vector, vec))
            candidates.append((vid, dot))
        candidates.sort(key=lambda x: (-x[1], x[0]))
        return candidates[:k]

    def count(self) -> int:
        return len(self._vectors)

    def contains_ids(self, ids: Sequence[int]) -> set[int]:
        return {int(i) for i in ids if int(i) in self._vectors}

    def replace_all(self, ids: Sequence[int], vectors: np.ndarray) -> None:
        values: list[int] = []
        for raw_id in ids:
            if isinstance(raw_id, bool) or not isinstance(raw_id, Integral):
                raise ValueError("ids must be integers")
            value = int(raw_id)
            if value < 0 or value > _UINT64_MAX:
                raise ValueError("ids must fit in uint64")
            values.append(value)
        if len(values) != len(set(values)):
            raise ValueError("ids must be unique")

        try:
            matrix = np.asarray(vectors, dtype=np.float32)
        except (TypeError, ValueError) as exc:
            raise ValueError("vectors must be numeric") from exc
        expected_shape = (len(values), self.dimension)
        if matrix.shape != expected_shape:
            raise ValueError(f"vectors must have shape {expected_shape}")
        if not np.all(np.isfinite(matrix)):
            raise ValueError("vectors must contain only finite values")
        matrix = np.ascontiguousarray(matrix)

        new_vectors: dict[int, np.ndarray] = {}
        for vid, vec in zip(values, matrix):
            new_vectors[vid] = vec.copy()
        self._vectors = new_vectors

    def artifact_sha256(self) -> str:
        stream = bytearray()
        for vid in sorted(self._vectors):
            vector = self._vectors[vid]
            blob = np.asarray(vector, dtype="<f4").tobytes()
            stream += struct.pack(">Q", vid)
            stream += struct.pack(">Q", len(blob))
            stream += blob
        return "sha256:" + hashlib.sha256(bytes(stream)).hexdigest()
