import multiprocessing
import os
import stat
import sys
import time
from pathlib import Path

import pytest

from historical_corpus.locks import (
    CorpusLockError,
    shared_lock,
    exclusive_lock,
)

pytestmark = pytest.mark.skipif(sys.platform != 'linux', reason="Linux-only lock tests")


def _child_shared(lock_path: str, ready: multiprocessing.Value, done: multiprocessing.Value) -> None:
    """Hold a shared lock in a child process."""
    from historical_corpus.locks import shared_lock
    with shared_lock(lock_path):
        ready.value = 1
        # Wait until parent signals done
        while not done.value:
            time.sleep(0.01)


def _child_exclusive(lock_path: str, ready: multiprocessing.Value, done: multiprocessing.Value) -> None:
    """Hold an exclusive lock in a child process."""
    from historical_corpus.locks import exclusive_lock
    with exclusive_lock(lock_path):
        ready.value = 1
        while not done.value:
            time.sleep(0.01)


def _child_try_shared(lock_path: str, result: multiprocessing.Value) -> None:
    """Attempt to acquire a shared lock; record success/failure."""
    from historical_corpus.locks import shared_lock, CorpusLockError
    try:
        with shared_lock(lock_path):
            result.value = 0  # success
    except CorpusLockError:
        result.value = 1  # rejected


def _child_try_exclusive(lock_path: str, result: multiprocessing.Value) -> None:
    """Attempt to acquire an exclusive lock; record success/failure."""
    from historical_corpus.locks import exclusive_lock, CorpusLockError
    try:
        with exclusive_lock(lock_path):
            result.value = 0  # success
    except CorpusLockError:
        result.value = 1  # rejected


def _bounded_join(proc: multiprocessing.Process, timeout: float = 5.0) -> None:
    """Join with bounded timeout; terminate if still alive."""
    proc.join(timeout)
    if proc.is_alive():
        proc.terminate()
        proc.join(timeout)


def test_shared_lock_permissions(tmp_path):
    """Verify parent dir 0700 and lock file 0600 under permissive umask."""
    old_umask = os.umask(0)
    try:
        lock_dir = tmp_path / "locks"
        lock_path = lock_dir / "lock"
        with shared_lock(str(lock_path)):
            parent_mode = stat.S_IMODE(os.stat(lock_dir).st_mode)
            assert parent_mode == 0o700
            file_mode = stat.S_IMODE(os.stat(lock_path).st_mode)
            assert file_mode == 0o600
    finally:
        os.umask(old_umask)


def test_exclusive_lock_permissions(tmp_path):
    """Verify parent dir 0700 and lock file 0600 under permissive umask."""
    old_umask = os.umask(0)
    try:
        lock_dir = tmp_path / "locks"
        lock_path = lock_dir / "lock"
        with exclusive_lock(str(lock_path)):
            parent_mode = stat.S_IMODE(os.stat(lock_dir).st_mode)
            assert parent_mode == 0o700
            file_mode = stat.S_IMODE(os.stat(lock_path).st_mode)
            assert file_mode == 0o600
    finally:
        os.umask(old_umask)


def test_concurrent_shared_locks_succeed(tmp_path):
    """Prove concurrent shared locks succeed using spawn context."""
    ctx = multiprocessing.get_context("spawn")
    lock_path = str(tmp_path / "lock")
    ready1 = ctx.Value("i", 0)
    ready2 = ctx.Value("i", 0)
    done = ctx.Value("i", 0)

    p1 = ctx.Process(target=_child_shared, args=(lock_path, ready1, done))
    p2 = ctx.Process(target=_child_shared, args=(lock_path, ready2, done))
    p1.start()
    p2.start()

    try:
        # Wait for both to be ready (bounded)
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            if ready1.value and ready2.value:
                break
            time.sleep(0.01)
        assert ready1.value and ready2.value, "Children did not acquire shared locks in time"

        done.value = 1
        _bounded_join(p1)
        _bounded_join(p2)
        assert p1.exitcode == 0
        assert p2.exitcode == 0
    finally:
        done.value = 1
        _bounded_join(p1)
        _bounded_join(p2)


def test_exclusive_rejected_during_shared_hold(tmp_path):
    """Exclusive lock is rejected while a shared lock is held."""
    ctx = multiprocessing.get_context("spawn")
    lock_path = str(tmp_path / "lock")
    ready = ctx.Value("i", 0)
    done = ctx.Value("i", 0)
    result = ctx.Value("i", -1)

    p_shared = ctx.Process(target=_child_shared, args=(lock_path, ready, done))
    p_shared.start()

    try:
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            if ready.value:
                break
            time.sleep(0.01)
        assert ready.value, "Shared child did not acquire lock in time"

        p_excl = ctx.Process(target=_child_try_exclusive, args=(lock_path, result))
        p_excl.start()
        _bounded_join(p_excl)
        assert result.value == 1, "Exclusive lock should be rejected during shared hold"

        done.value = 1
        _bounded_join(p_shared)
        assert p_shared.exitcode == 0
    finally:
        done.value = 1
        _bounded_join(p_shared)


def test_shared_rejected_during_exclusive_hold(tmp_path):
    """Shared lock is rejected while an exclusive lock is held."""
    ctx = multiprocessing.get_context("spawn")
    lock_path = str(tmp_path / "lock")
    ready = ctx.Value("i", 0)
    done = ctx.Value("i", 0)
    result = ctx.Value("i", -1)

    p_excl = ctx.Process(target=_child_exclusive, args=(lock_path, ready, done))
    p_excl.start()

    try:
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            if ready.value:
                break
            time.sleep(0.01)
        assert ready.value, "Exclusive child did not acquire lock in time"

        p_shared = ctx.Process(target=_child_try_shared, args=(lock_path, result))
        p_shared.start()
        _bounded_join(p_shared)
        assert result.value == 1, "Shared lock should be rejected during exclusive hold"

        done.value = 1
        _bounded_join(p_excl)
        assert p_excl.exitcode == 0
    finally:
        done.value = 1
        _bounded_join(p_excl)


def test_corpus_lock_error_attributes(tmp_path):
    """Verify CorpusLockError.path, .mode, and message excludes test content."""
    ctx = multiprocessing.get_context("spawn")
    lock_path = tmp_path / "lock"
    lock_path.write_text("SECRET_TEST_CONTENT")

    ready = ctx.Value("i", 0)
    done = ctx.Value("i", 0)

    p_holder = ctx.Process(target=_child_exclusive, args=(str(lock_path), ready, done))
    p_holder.start()

    try:
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            if ready.value:
                break
            time.sleep(0.01)
        assert ready.value, "Holder did not acquire lock in time"

        with pytest.raises(CorpusLockError) as exc_info:
            with exclusive_lock(lock_path):
                pass
        error = exc_info.value
        assert error.path == lock_path
        assert error.mode == "exclusive"
        assert "SECRET_TEST_CONTENT" not in str(error)
    finally:
        done.value = 1
        _bounded_join(p_holder)
    assert p_holder.exitcode == 0


def test_context_exit_releases_lock(tmp_path):
    """Normal and exceptional context exit release the lock for later exclusive acquisition."""
    from historical_corpus.locks import shared_lock, exclusive_lock

    lock_path = str(tmp_path / "lock")

    # Normal exit
    with shared_lock(lock_path):
        pass

    # After normal exit, exclusive should succeed
    with exclusive_lock(lock_path):
        pass

    # Exceptional exit
    try:
        with shared_lock(lock_path):
            raise RuntimeError("test error")
    except RuntimeError:
        pass

    # After exceptional exit, exclusive should succeed
    with exclusive_lock(lock_path):
        pass
