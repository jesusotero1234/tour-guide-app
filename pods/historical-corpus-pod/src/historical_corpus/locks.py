"""Linux-only non-blocking flock context managers for the historical corpus pod.

This module intentionally relies on ``fcntl.flock`` as the Linux/Podman
primitive. It does not provide a fallback marker-file implementation.
"""

from __future__ import annotations

import contextlib
import fcntl
import os
from pathlib import Path
from typing import Iterator, Literal

__all__ = ["CorpusLockError", "shared_lock", "exclusive_lock"]

LockMode = Literal["shared", "exclusive"]

# Final permission bits that must hold regardless of the process umask.
_DIR_MODE = 0o700
_FILE_MODE = 0o600


class CorpusLockError(Exception):
    """Raised when a non-blocking flock cannot be acquired or the lock file
    cannot be prepared.

    Attributes:
        path: The ``pathlib.Path`` of the lock file.
        mode: The requested lock mode (``"shared"`` or ``"exclusive"``).
    """

    def __init__(self, path: Path, mode: LockMode, reason: str) -> None:
        self.path = path
        self.mode = mode
        super().__init__(f"{mode} lock unavailable for {path}: {reason}")


def _prepare_lock_file(path: Path, mode: LockMode) -> int:
    """Create the parent directory and lock file with enforced permissions.

    Returns the open file descriptor. Raises ``CorpusLockError`` on any
    filesystem/open failure without leaking file contents.
    """
    try:
        parent = path.parent
        parent.mkdir(parents=True, exist_ok=True)
        os.chmod(parent, _DIR_MODE)

        flags = os.O_RDWR | os.O_CREAT | os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW

        fd = os.open(str(path), flags, _FILE_MODE)
        try:
            os.fchmod(fd, _FILE_MODE)
        except OSError:
            os.close(fd)
            raise
        return fd
    except OSError as exc:
        raise CorpusLockError(path, mode, "filesystem error") from exc


@contextlib.contextmanager
def _flock(path: Path, mode: LockMode) -> Iterator[None]:
    """Acquire a non-blocking flock, yield, then unlock and close.

    The file descriptor remains open across the yield. On normal or
    exceptional exit the lock is released and the descriptor closed. If
    acquisition fails, the descriptor is closed and ``CorpusLockError`` is
    raised.
    """
    fd = _prepare_lock_file(path, mode)
    acquired = False
    try:
        lock_flags = fcntl.LOCK_SH if mode == "shared" else fcntl.LOCK_EX
        try:
            fcntl.flock(fd, lock_flags | fcntl.LOCK_NB)
            acquired = True
        except OSError:
            raise CorpusLockError(path, mode, "lock held by another process")
        yield
    finally:
        if acquired:
            try:
                fcntl.flock(fd, fcntl.LOCK_UN)
            except OSError:
                pass
        os.close(fd)


@contextlib.contextmanager
def shared_lock(path: Path | str) -> Iterator[None]:
    """Acquire a non-blocking shared (read) flock on *path*.

    Linux-only: uses ``fcntl.flock`` with ``LOCK_SH | LOCK_NB``.
    """
    with _flock(Path(path), "shared"):
        yield


@contextlib.contextmanager
def exclusive_lock(path: Path | str) -> Iterator[None]:
    """Acquire a non-blocking exclusive (write) flock on *path*.

    Linux-only: uses ``fcntl.flock`` with ``LOCK_EX | LOCK_NB``.
    """
    with _flock(Path(path), "exclusive"):
        yield
