from __future__ import annotations

import numpy as np
import pytest

from historical_corpus.qwen_models import (
    HISTORICAL_RETRIEVAL_INSTRUCTION,
    QwenEmbeddingProvider,
    QwenReranker,
    format_embedding_query,
    format_reranker_input,
)
from historical_corpus.turbovec_index import TurboVecIndex


class TestTurboVecIndex:
    def test_upsert_search_persistence(self, tmp_path):
        index = TurboVecIndex(dimension=8, path=tmp_path / "test.tvim")
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1, 2], np.stack([v1, v2]))
        assert index.count() == 2

        results = index.search(v1, k=2)
        assert len(results) == 2
        assert results[0][0] == 1
        assert results[1][0] == 2
        assert all(isinstance(r[0], int) for r in results)
        assert all(isinstance(r[1], float) for r in results)

        results_allow = index.search(v1, k=2, allowlist={2})
        assert len(results_allow) == 1
        assert results_allow[0][0] == 2

        index2 = TurboVecIndex(dimension=8, path=tmp_path / "test.tvim")
        assert index2.count() == 2
        results2 = index2.search(v1, k=2)
        assert len(results2) == 2
        assert results2[0][0] == 1
        assert results2[1][0] == 2

    def test_upsert_replaces_existing_id(self, tmp_path):
        index = TurboVecIndex(dimension=8, path=tmp_path / "test.tvim")
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1], np.stack([v1]))
        index.upsert([1], np.stack([v2]))
        assert index.count() == 1
        results = index.search(v2, k=1)
        assert results[0][0] == 1

    def test_remove_ignores_missing_ids(self, tmp_path):
        index = TurboVecIndex(dimension=8, path=tmp_path / "test.tvim")
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1], np.stack([v1]))
        index.remove([999])
        assert index.count() == 1

    def test_empty_allowlist_returns_no_hits(self, tmp_path):
        index = TurboVecIndex(dimension=8, path=tmp_path / "test.tvim")
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1], np.stack([v1]))
        results = index.search(v1, k=1, allowlist=set())
        assert results == []

    def test_invalid_vector_shape(self, tmp_path):
        index = TurboVecIndex(dimension=8, path=tmp_path / "test.tvim")
        bad_vec = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        with pytest.raises(ValueError):
            index.upsert([1], np.stack([bad_vec]))

    def test_non_finite_vectors(self, tmp_path):
        index = TurboVecIndex(dimension=8, path=tmp_path / "test.tvim")
        bad_vec = np.array([1.0, np.nan, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        with pytest.raises(ValueError):
            index.upsert([1], np.stack([bad_vec]))

    def test_duplicate_ids_in_one_batch(self, tmp_path):
        index = TurboVecIndex(dimension=8, path=tmp_path / "test.tvim")
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        with pytest.raises(ValueError):
            index.upsert([1, 1], np.stack([v1, v1]))

    def test_negative_ids(self, tmp_path):
        index = TurboVecIndex(dimension=8, path=tmp_path / "test.tvim")
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        with pytest.raises(ValueError):
            index.upsert([-1], np.stack([v1]))

    def test_non_positive_k_returns_empty_list(self, tmp_path):
        index = TurboVecIndex(dimension=8, path=tmp_path / "test.tvim")
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1], np.stack([v1]))
        results = index.search(v1, k=0)
        assert results == []

    def test_invalid_query_shape(self, tmp_path):
        index = TurboVecIndex(dimension=8, path=tmp_path / "test.tvim")
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1], np.stack([v1]))
        bad_query = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        with pytest.raises(ValueError):
            index.search(bad_query, k=1)


class TestFormatting:
    def test_format_embedding_query(self):
        query = "test query"
        expected = f"Instruct: {HISTORICAL_RETRIEVAL_INSTRUCTION}\nQuery:{query}"
        assert format_embedding_query(query) == expected

    def test_format_reranker_input(self):
        instruction = "test instruction"
        query = "test query"
        document = "test document"
        expected = f"<Instruct>: {instruction}\n<Query>: {query}\n<Document>: {document}"
        assert format_reranker_input(instruction, query, document) == expected


class TestQwenProviders:
    def test_qwen_embedding_provider(self):
        provider = QwenEmbeddingProvider()
        assert provider.model_id == "Qwen/Qwen3-Embedding-0.6B"
        assert provider.dimension == 1024

    def test_qwen_reranker(self):
        reranker = QwenReranker()
        assert reranker.model_id == "Qwen/Qwen3-Reranker-0.6B"
