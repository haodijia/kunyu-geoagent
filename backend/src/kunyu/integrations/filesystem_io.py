"""Descriptor-relative workspace IO, stat versions and private atomic publication."""

import errno
import logging
import os
import re
import stat
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from threading import Event
from uuid import uuid4

from kunyu.domain.filesystem import FilesystemError, FsTarget

logger = logging.getLogger(__name__)
CHUNK_BYTES = 64 * 1024


def check_cancelled(cancelled: Event, verb: str) -> None:
    if cancelled.is_set():
        raise FilesystemError("FS_ABORTED", f"{verb} aborted")


def version_of(info: os.stat_result) -> str:
    return f"{info.st_dev}:{info.st_ino}:{info.st_size}:{info.st_mtime_ns}:{info.st_ctime_ns}"


def io_error(error: OSError, path: str, verb: str) -> FilesystemError:
    code = (
        "FS_PERMISSION_DENIED"
        if error.errno in {errno.EACCES, errno.EPERM}
        else "FS_IO_ERROR"
    )
    return FilesystemError(code, f'cannot {verb} "{path}": {error.strerror}')


@contextmanager
def open_parent(
    root: Path,
    target: FsTarget,
    *,
    create: bool = False,
    cancelled: Event | None = None,
) -> Iterator[int]:
    if (
        target.kind != "workspace"
        or target.attachment is not None
        or re.fullmatch(r"[A-Za-z0-9_-]{1,64}", target.scope.workspace_id) is None
        or not target.parts
        or any(
            part in {"", ".", ".."} or "/" in part or "\x00" in part
            for part in target.parts
        )
        or target.display_path != "/workspace/" + "/".join(target.parts)
    ):
        raise FilesystemError(
            "FS_INVALID_TARGET", "The workspace target is not a resolved file path."
        )
    descriptors = []
    try:
        descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        descriptors.append(descriptor)
        for name in (
            "workspaces",
            target.scope.workspace_id,
            "files",
            *target.parts[:-1],
        ):
            if cancelled is not None:
                check_cancelled(cancelled, "write" if create else "read")
            if create:
                try:
                    os.mkdir(name, 0o700, dir_fd=descriptor)
                except FileExistsError:
                    pass  # The descriptor open below verifies the existing directory.
            descriptor = os.open(
                name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor
            )
            descriptors.append(descriptor)
        yield descriptor
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


def probe_at(parent: int, name: str) -> os.stat_result | None:
    try:
        return os.stat(name, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        return None


@contextmanager
def open_file(root: Path, target: FsTarget) -> Iterator[int]:
    try:
        with open_parent(root, target) as parent:
            descriptor = os.open(
                target.parts[-1],
                os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                dir_fd=parent,
            )
            try:
                if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                    raise FilesystemError(
                        "FS_NOT_REGULAR_FILE",
                        f'cannot read "{target.display_path}": not a regular file',
                    )
                yield descriptor
            finally:
                os.close(descriptor)
    except FileNotFoundError as error:
        raise FilesystemError(
            "FS_NOT_FOUND", f'cannot read "{target.display_path}": not found'
        ) from error


def atomic_write(
    parent: int,
    name: str,
    content: str,
    existing: os.stat_result | None,
    target: FsTarget,
    create_if_absent: bool,
    cancelled: Event,
) -> str:
    check_cancelled(cancelled, "write")
    staging = f".{uuid4()}.tmpdir"
    os.mkdir(staging, 0o700, dir_fd=parent)
    try:
        stage_fd = os.open(
            staging, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent
        )
    except OSError:
        os.rmdir(staging, dir_fd=parent)
        raise
    committed = False
    staged_file = False
    try:
        os.fchmod(stage_fd, 0o700)
        descriptor = os.open(
            "content",
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o600,
            dir_fd=stage_fd,
        )
        staged_file = True
        try:
            os.fchmod(descriptor, 0o600)
            data = content.encode("utf-8")
            offset = 0
            while offset < len(data):
                check_cancelled(cancelled, "write")
                written = os.write(descriptor, data[offset : offset + CHUNK_BYTES])
                if written <= 0:
                    raise FilesystemError(
                        "FS_IO_ERROR", "The staged file write made no progress."
                    )
                offset += written
            if existing is not None:
                os.fchmod(descriptor, stat.S_IMODE(existing.st_mode))
            os.fsync(descriptor)
            staged_inode = os.fstat(descriptor).st_ino
        finally:
            os.close(descriptor)
        check_cancelled(cancelled, "write")
        # Internal mutations are serialized. Check external changes again after staging.
        current = probe_at(parent, name)
        if existing is not None and (
            current is None or version_of(current) != version_of(existing)
        ):
            raise FilesystemError(
                "FS_STALE_VERSION",
                f'cannot write "{target.display_path}": file changed since it was read',
            )
        check_cancelled(cancelled, "write")
        if create_if_absent:
            try:
                os.link(
                    "content",
                    name,
                    src_dir_fd=stage_fd,
                    dst_dir_fd=parent,
                    follow_symlinks=False,
                )
            except FileExistsError as error:
                collision = probe_at(parent, name)
                if collision is not None and not stat.S_ISREG(collision.st_mode):
                    raise FilesystemError(
                        "FS_NOT_REGULAR_FILE",
                        f'cannot write "{target.display_path}": not a regular file',
                    ) from error
                raise FilesystemError(
                    "FS_NOT_OBSERVED",
                    f'cannot overwrite existing "{target.display_path}" without reading it first',
                ) from error
        else:
            os.rename("content", name, src_dir_fd=stage_fd, dst_dir_fd=parent)
            staged_file = False
        committed = True
        os.fsync(parent)
    finally:
        try:
            if staged_file:
                os.unlink("content", dir_fd=stage_fd)
            os.close(stage_fd)
            stage_fd = -1
            os.rmdir(staging, dir_fd=parent)
        except OSError:
            if not committed:
                raise
            logger.exception(
                "Committed file staging cleanup failed for %s", target.display_path
            )
        finally:
            if stage_fd >= 0:
                os.close(stage_fd)
    # Unlinking the staging hard link changes ctime. Observe only after cleanup.
    after = probe_at(parent, name)
    if after is None or after.st_ino != staged_inode:
        raise FilesystemError(
            "FS_STALE_VERSION",
            f'cannot write "{target.display_path}": file changed after publication',
        )
    return version_of(after)
