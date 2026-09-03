from __future__ import annotations

import hashlib
import os
import struct

import numpy as np
import pytest

from historical_corpus.qwen_models import (
    HISTORICAL_RETRIEVAL_INSTRUCTION,
    QwenEmbeddingProvider,
    QwenReranker,
    format_embedding_query,
    format_reranker_input,
)
from historical_corpus.backends import InMemoryVectorIndex
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


class TestInMemoryVectorIndex:
    def test_is_persistent_false(self):
        index = InMemoryVectorIndex(dimension=8)
        assert index.is_persistent is False

    def test_contains_ids(self):
        index = InMemoryVectorIndex(dimension=8)
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1, 2], np.stack([v1, v2]))
        assert index.contains_ids([1, 2]) == {1, 2}
        assert index.contains_ids([1, 3]) == {1}
        assert index.contains_ids([3]) == set()

    def test_replace_all_atomic(self):
        index = InMemoryVectorIndex(dimension=8)
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1, 2], np.stack([v1, v2]))
        v3 = np.array([0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v4 = np.array([0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.replace_all([3, 4], np.stack([v3, v4]))
        assert index.count() == 2
        assert index.contains_ids([3, 4]) == {3, 4}
        assert index.contains_ids([1, 2]) == set()

    def test_replace_all_empty_matrix(self):
        index = InMemoryVectorIndex(dimension=8)
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1], np.stack([v1]))
        empty = np.empty((0, 8), dtype=np.float32)
        index.replace_all([], empty)
        assert index.count() == 0
        assert index.contains_ids([1]) == set()

    def test_replace_all_validates_unique_ids_and_shape(self):
        index = InMemoryVectorIndex(dimension=8)
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1], np.stack([v1]))
        with pytest.raises(ValueError):
            index.replace_all([1, 1], np.stack([v1, v1]))
        with pytest.raises(ValueError):
            index.replace_all([1], np.array([1.0, 0.0, 0.0], dtype=np.float32))
        assert index.count() == 1
        assert index.contains_ids([1]) == {1}

    def test_replace_all_validates_finite(self):
        index = InMemoryVectorIndex(dimension=8)
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1], np.stack([v1]))
        bad = np.array([1.0, np.nan, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        with pytest.raises(ValueError):
            index.replace_all([1], np.stack([bad]))
        assert index.count() == 1
        assert index.contains_ids([1]) == {1}

    def test_artifact_sha256(self):
        index = InMemoryVectorIndex(dimension=8)
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.replace_all([2, 1], np.stack([v2, v1]))
        stream = bytearray()
        for vid, vector in sorted(((2, v2), (1, v1))):
            blob = np.asarray(vector, dtype="<f4").tobytes()
            stream += struct.pack(">Q", vid)
            stream += struct.pack(">Q", len(blob))
            stream += blob
        expected = "sha256:" + hashlib.sha256(bytes(stream)).hexdigest()
        assert index.artifact_sha256() == expected


class TestTurboVecReplaceAll:
    def test_is_persistent_true(self, tmp_path):
        index = TurboVecIndex(dimension=8, bit_width=4, path=tmp_path / "test.tvim")
        assert index.is_persistent is True

    def test_contains_ids(self, tmp_path):
        index = TurboVecIndex(dimension=8, bit_width=4, path=tmp_path / "test.tvim")
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1, 2], np.stack([v1, v2]))
        assert index.contains_ids([1, 2]) == {1, 2}
        assert index.contains_ids([1, 3]) == {1}
        assert index.contains_ids([3]) == set()

    def test_replace_all_replaces_all_prior_ids(self, tmp_path):
        index = TurboVecIndex(dimension=8, bit_width=4, path=tmp_path / "test.tvim")
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1, 2], np.stack([v1, v2]))
        v3 = np.array([0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v4 = np.array([0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.replace_all([3, 4], np.stack([v3, v4]))
        assert index.count() == 2
        assert index.contains_ids([3, 4]) == {3, 4}
        assert index.contains_ids([1, 2]) == set()

    def test_replace_all_persists_after_reopening(self, tmp_path):
        path = tmp_path / "test.tvim"
        index = TurboVecIndex(dimension=8, bit_width=4, path=path)
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1, 2], np.stack([v1, v2]))
        v3 = np.array([0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v4 = np.array([0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.replace_all([3, 4], np.stack([v3, v4]))
        index2 = TurboVecIndex(dimension=8, bit_width=4, path=path)
        assert index2.count() == 2
        assert index2.contains_ids([3, 4]) == {3, 4}
        assert index2.contains_ids([1, 2]) == set()

    def test_replace_all_empty_matrix_persists(self, tmp_path):
        path = tmp_path / "test.tvim"
        index = TurboVecIndex(dimension=8, bit_width=4, path=path)
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1], np.stack([v1]))
        empty = np.empty((0, 8), dtype=np.float32)
        index.replace_all([], empty)
        index2 = TurboVecIndex(dimension=8, bit_width=4, path=path)
        assert index2.count() == 0
        assert index2.contains_ids([1]) == set()

    def test_artifact_sha256(self, tmp_path):
        path = tmp_path / "test.tvim"
        index = TurboVecIndex(dimension=8, bit_width=4, path=path)
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.replace_all([2, 1], np.stack([v2, v1]))
        file_bytes = path.read_bytes()
        expected = "sha256:" + hashlib.sha256(file_bytes).hexdigest()
        assert index.artifact_sha256() == expected

    def test_invalid_duplicate_ids_leave_unchanged(self, tmp_path):
        path = tmp_path / "test.tvim"
        index = TurboVecIndex(dimension=8, bit_width=4, path=path)
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1, 2], np.stack([v1, v2]))
        prior_bytes = path.read_bytes()
        prior_count = index.count()
        prior_membership = index.contains_ids([1, 2])
        prior_results = index.search(v1, k=2)
        with pytest.raises(ValueError):
            index.replace_all([1, 1], np.stack([v1, v1]))
        assert path.read_bytes() == prior_bytes
        assert index.count() == prior_count
        assert index.contains_ids([1, 2]) == prior_membership
        assert index.search(v1, k=2) == prior_results

    def test_invalid_wrong_shape_leave_unchanged(self, tmp_path):
        path = tmp_path / "test.tvim"
        index = TurboVecIndex(dimension=8, bit_width=4, path=path)
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1], np.stack([v1]))
        prior_bytes = path.read_bytes()
        prior_count = index.count()
        prior_membership = index.contains_ids([1])
        prior_results = index.search(v1, k=1)
        bad = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        with pytest.raises(ValueError):
            index.replace_all([1], np.stack([bad]))
        assert path.read_bytes() == prior_bytes
        assert index.count() == prior_count
        assert index.contains_ids([1]) == prior_membership
        assert index.search(v1, k=1) == prior_results

    def test_invalid_non_finite_leave_unchanged(self, tmp_path):
        path = tmp_path / "test.tvim"
        index = TurboVecIndex(dimension=8, bit_width=4, path=path)
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1], np.stack([v1]))
        prior_bytes = path.read_bytes()
        prior_count = index.count()
        prior_membership = index.contains_ids([1])
        prior_results = index.search(v1, k=1)
        bad = np.array([1.0, np.nan, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        with pytest.raises(ValueError):
            index.replace_all([1], np.stack([bad]))
        assert path.read_bytes() == prior_bytes
        assert index.count() == prior_count
        assert index.contains_ids([1]) == prior_membership
        assert index.search(v1, k=1) == prior_results

    def test_os_replace_failure_leaves_unchanged(self, tmp_path, monkeypatch):
        path = tmp_path / "test.tvim"
        index = TurboVecIndex(dimension=8, bit_width=4, path=path)
        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        index.upsert([1, 2], np.stack([v1, v2]))
        prior_bytes = path.read_bytes()
        prior_count = index.count()
        prior_membership = index.contains_ids([1, 2])
        prior_results = index.search(v1, k=2)

        original_replace = os.replace

        def failing_replace(src, dst, **kwargs):
            raise OSError("simulated replace failure")

        monkeypatch.setattr(os, "replace", failing_replace)
        v3 = np.array([0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        v4 = np.array([0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        with pytest.raises(OSError):
            index.replace_all([3, 4], np.stack([v3, v4]))
        monkeypatch.setattr(os, "replace", original_replace)

        assert path.read_bytes() == prior_bytes
        assert index.count() == prior_count
        assert index.contains_ids([1, 2]) == prior_membership
        assert index.search(v1, k=2) == prior_results

        temp_files = [f for f in os.listdir(tmp_path) if f != "test.tvim"]
        assert temp_files == []

    @pytest.mark.parametrize(
        "setup",
        ["existing_symlink", "broken_symlink", "existing_directory"],
    )
    def test_unsafe_final_path_rejected(self, tmp_path, setup):
        link = tmp_path / "test.tvim"
        if setup == "existing_symlink":
            target = tmp_path / "existing_target"
            target.write_bytes(b"existing data")
            os.symlink(target, link)
        elif setup == "broken_symlink":
            os.symlink(tmp_path / "nonexistent_target", link)
        else:
            link.mkdir()

        with pytest.raises(ValueError):
            TurboVecIndex(dimension=8, bit_width=4, path=link)

        if setup == "existing_symlink":
            assert os.path.islink(link)
            assert (tmp_path / "existing_target").read_bytes() == b"existing data"
        elif setup == "broken_symlink":
            assert os.path.islink(link)
        else:
            assert os.path.isdir(link)

    def test_unsafe_path_substitution_after_construction(self, tmp_path):
        link = tmp_path / "test.tvim"
        index = TurboVecIndex(dimension=8, bit_width=4, path=link)

        sentinel = tmp_path / "sentinel"
        sentinel.write_bytes(b"sentinel-bytes")
        os.symlink(sentinel, link)

        v1 = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        with pytest.raises(ValueError):
            index.replace_all([1], np.stack([v1]))

        assert os.path.islink(link)
        assert sentinel.read_bytes() == b"sentinel-bytes"

        with pytest.raises(ValueError):
            index.artifact_sha256()

        assert os.path.islink(link)
        assert sentinel.read_bytes() == b"sentinel-bytes"


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
