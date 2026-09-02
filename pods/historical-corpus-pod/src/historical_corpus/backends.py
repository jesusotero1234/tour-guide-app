from __future__ import annotations

import hashlib
import math
import re
import unicodedata
from typing import Protocol, Sequence

import numpy as np


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

    def upsert(self, ids: Sequence[int], vectors: np.ndarray) -> None:
        ...

    def remove(self, ids: Sequence[int]) -> None:
        ...

    def search(self, vector: np.ndarray, k: int, allowlist: set[int] | None = None) -> list[tuple[int, float]]:
        ...

    def count(self) -> int:
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
