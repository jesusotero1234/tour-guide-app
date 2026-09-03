from __future__ import annotations

import hashlib
import os
import stat
import tempfile
import threading
from numbers import Integral
from pathlib import Path
from typing import Sequence

import numpy as np
from turbovec import IdMapIndex

_UINT64_MAX = (1 << 64) - 1


def _lstat_if_present(path: Path) -> os.stat_result | None:
    try:
        return os.lstat(path)
    except FileNotFoundError:
        return None


class TurboVecIndex:
    is_persistent = True

    def __init__(
        self,
        *,
        path: str | Path,
        dimension: int,
        bit_width: int = 4,
    ) -> None:
        if dimension <= 0 or dimension % 8 != 0:
            raise ValueError("dimension must be positive and divisible by 8")
        if bit_width not in (2, 3, 4):
            raise ValueError("bit_width must be 2, 3, or 4")

        self.dimension = dimension
        self._bit_width = bit_width
        self._path = Path(path)
        self._lock = threading.RLock()

        st = _lstat_if_present(self._path)
        if st is not None:
            if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
                raise ValueError("path must be a regular file, not a symlink")
            self._index = IdMapIndex.load(str(self._path))
            if self._index.dim != dimension:
                raise ValueError("persisted TurboVec dimension does not match configuration")
            if self._index.bit_width != bit_width:
                raise ValueError("persisted TurboVec bit width does not match configuration")
        else:
            self._index = IdMapIndex(dim=dimension, bit_width=bit_width)

    @staticmethod
    def _validate_ids(ids: Sequence[int]) -> list[int]:
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
        return values

    def _validate_vectors(
        self,
        vectors: np.ndarray,
        expected_count: int,
    ) -> np.ndarray:
        try:
            matrix = np.asarray(vectors, dtype=np.float32)
        except (TypeError, ValueError) as exc:
            raise ValueError("vectors must be numeric") from exc
        expected_shape = (expected_count, self.dimension)
        if matrix.shape != expected_shape:
            raise ValueError(f"vectors must have shape {expected_shape}")
        if not np.all(np.isfinite(matrix)):
            raise ValueError("vectors must contain only finite values")
        return np.ascontiguousarray(matrix)

    def _validate_query(self, vector: np.ndarray) -> np.ndarray:
        try:
            query = np.asarray(vector, dtype=np.float32)
        except (TypeError, ValueError) as exc:
            raise ValueError("query vector must be numeric") from exc
        if query.shape != (self.dimension,):
            raise ValueError(f"query vector must have shape ({self.dimension},)")
        if not np.all(np.isfinite(query)):
            raise ValueError("query vector must contain only finite values")
        return np.ascontiguousarray(query)

    def _sync(self) -> None:
        st = _lstat_if_present(self._path)
        if st is not None and (stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode)):
            raise ValueError("path must be a regular file, not a symlink")
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._index.sync(str(self._path))

    def _fsync_file(self, path: Path) -> None:
        flags = os.O_RDONLY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        fd = os.open(str(path), flags)
        try:
            st = os.fstat(fd)
            if not stat.S_ISREG(st.st_mode):
                raise ValueError("path must be a regular file, not a symlink")
            os.fsync(fd)
        finally:
            os.close(fd)

    def _fsync_dir(self, path: Path) -> None:
        flags = os.O_RDONLY
        if hasattr(os, "O_DIRECTORY"):
            flags |= os.O_DIRECTORY
        fd = os.open(str(path), flags)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

    def upsert(self, ids: Sequence[int], vectors: np.ndarray) -> None:
        values = self._validate_ids(ids)
        matrix = self._validate_vectors(vectors, len(values))
        if not values:
            return

        external_ids = np.asarray(values, dtype=np.uint64)
        with self._lock:
            for value in values:
                if value in self._index:
                    self._index.remove(value)
            self._index.add_with_ids(matrix, external_ids)
            self._sync()

    def remove(self, ids: Sequence[int]) -> None:
        values = self._validate_ids(ids)
        changed = False
        with self._lock:
            for value in values:
                changed = self._index.remove(value) or changed
            if changed:
                self._sync()

    def search(
        self,
        vector: np.ndarray,
        k: int,
        allowlist: set[int] | None = None,
    ) -> list[tuple[int, float]]:
        query = self._validate_query(vector)
        if k <= 0:
            return []

        with self._lock:
            index_count = len(self._index)
            if index_count == 0:
                return []

            external_allowlist: np.ndarray | None = None
            candidate_count = index_count
            if allowlist is not None:
                allowed_ids = self._validate_ids(sorted(allowlist))
                present_ids = [value for value in allowed_ids if value in self._index]
                if not present_ids:
                    return []
                external_allowlist = np.asarray(present_ids, dtype=np.uint64)
                candidate_count = len(present_ids)

            effective_k = min(k, candidate_count)
            scores, ids = self._index.search(
                query.reshape(1, self.dimension),
                effective_k,
                allowlist=external_allowlist,
            )

        hits = [
            (int(external_id), float(score))
            for external_id, score in zip(ids[0], scores[0], strict=True)
        ]
        hits.sort(key=lambda hit: (-hit[1], hit[0]))
        return hits[:k]

    def count(self) -> int:
        with self._lock:
            return len(self._index)

    def contains_ids(self, ids: Sequence[int]) -> set[int]:
        values = self._validate_ids(ids)
        with self._lock:
            return {value for value in values if value in self._index}

    def replace_all(self, ids: Sequence[int], vectors: np.ndarray) -> None:
        values = self._validate_ids(ids)
        matrix = self._validate_vectors(vectors, len(values))

        with self._lock:
            st = _lstat_if_present(self._path)
            if st is not None and (stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode)):
                raise ValueError("path must be a regular file, not a symlink")

            self._path.parent.mkdir(parents=True, exist_ok=True)
            temp_fd, temp_name = tempfile.mkstemp(
                prefix=f".{self._path.name}.",
                suffix=".tmp",
                dir=self._path.parent,
            )
            os.close(temp_fd)
            temp_path = Path(temp_name)

            try:
                new_index = IdMapIndex(dim=self.dimension, bit_width=self._bit_width)
                if values:
                    external_ids = np.asarray(values, dtype=np.uint64)
                    new_index.add_with_ids(matrix, external_ids)
                new_index.sync(str(temp_path))

                try:
                    temp_st = os.lstat(str(temp_path))
                except OSError:
                    raise ValueError("temporary artifact must be a regular file, not a symlink")
                if stat.S_ISLNK(temp_st.st_mode) or not stat.S_ISREG(temp_st.st_mode):
                    raise ValueError("temporary artifact must be a regular file, not a symlink")

                reloaded = IdMapIndex.load(str(temp_path))
                if reloaded.dim != self.dimension:
                    raise ValueError("reloaded dimension mismatch")
                if reloaded.bit_width != self._bit_width:
                    raise ValueError("reloaded bit width mismatch")
                if len(reloaded) != len(values):
                    raise ValueError("reloaded count mismatch")
                present_ids = {value for value in values if value in reloaded}
                if present_ids != set(values):
                    raise ValueError("reloaded membership mismatch")

                self._fsync_file(temp_path)
                final_st = _lstat_if_present(self._path)
                if final_st is not None and (stat.S_ISLNK(final_st.st_mode) or not stat.S_ISREG(final_st.st_mode)):
                    raise ValueError("path must be a regular file, not a symlink")
                os.replace(str(temp_path), str(self._path))
                self._fsync_dir(self._path.parent)
                self._index = reloaded
            except Exception:
                temp_st = _lstat_if_present(temp_path)
                if temp_st is not None and stat.S_ISREG(temp_st.st_mode) and not stat.S_ISLNK(temp_st.st_mode):
                    try:
                        os.unlink(str(temp_path))
                    except OSError:
                        pass
                raise

    def artifact_sha256(self) -> str:
        flags = os.O_RDONLY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        try:
            fd = os.open(str(self._path), flags)
        except OSError:
            raise ValueError("path must be a regular file, not a symlink")
        try:
            st = os.fstat(fd)
            if not stat.S_ISREG(st.st_mode):
                raise ValueError("path must be a regular file, not a symlink")
            hasher = hashlib.sha256()
            while True:
                chunk = os.read(fd, 65536)
                if not chunk:
                    break
                hasher.update(chunk)
            return "sha256:" + hasher.hexdigest()
        finally:
            os.close(fd)
