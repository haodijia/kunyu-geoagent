"""Windows workspace IO with pinned directories and no reparse-point traversal."""

import ctypes
import errno
import logging
import msvcrt
import os
import re
import stat
from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from ctypes import wintypes
from pathlib import Path
from threading import Event
from uuid import uuid4

from kunyu.domain.workspaces.filesystem import FilesystemError, FsTarget
from kunyu.integrations.filesystem.io import (
    check_cancelled,
    check_write_version,
    probe_at,
    version_of,
    write_content,
)

logger = logging.getLogger(__name__)
FILE_ATTRIBUTE_DIRECTORY = 0x10
FILE_ATTRIBUTE_REPARSE_POINT = 0x400
GENERIC_READ = 0x80000000
FILE_SHARE_READ_WRITE = 0x3  # Exclude DELETE sharing to pin the opened path.
OPEN_EXISTING = 3
FILE_FLAG_BACKUP_SEMANTICS = 0x02000000
FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000
FILE_ATTRIBUTE_TAG_INFO = 9
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value

kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
kernel32.CreateFileW.argtypes = (
    wintypes.LPCWSTR,
    wintypes.DWORD,
    wintypes.DWORD,
    ctypes.c_void_p,
    wintypes.DWORD,
    wintypes.DWORD,
    wintypes.HANDLE,
)
kernel32.CreateFileW.restype = wintypes.HANDLE
kernel32.GetFileInformationByHandleEx.argtypes = (
    wintypes.HANDLE,
    ctypes.c_int,
    ctypes.c_void_p,
    wintypes.DWORD,
)
kernel32.GetFileInformationByHandleEx.restype = wintypes.BOOL
kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
kernel32.CloseHandle.restype = wintypes.BOOL


class _AttributeTagInfo(ctypes.Structure):
    _fields_ = [("attributes", wintypes.DWORD), ("tag", wintypes.DWORD)]


def validate_component(name: str) -> None:
    # Windows aliases, alternate streams and separators must not escape a mount.
    if (
        not name
        or name in {".", ".."}
        or name.endswith((" ", "."))
        or any(char in '<>:"/\\|?*' or ord(char) < 32 for char in name)
        or re.match(r"(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)", name, re.I)
    ):
        raise FilesystemError(
            "FS_INVALID_PATH", "Invalid Windows workspace path component."
        )


def _open_handle(path: Path, access: int) -> tuple[int, int]:
    handle = kernel32.CreateFileW(
        str(path),
        access,
        FILE_SHARE_READ_WRITE,
        None,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
        None,
    )
    if handle == INVALID_HANDLE_VALUE:
        error = ctypes.WinError(ctypes.get_last_error())
        error.filename = str(path)
        raise error
    try:
        info = _AttributeTagInfo()
        if not kernel32.GetFileInformationByHandleEx(
            handle, FILE_ATTRIBUTE_TAG_INFO, ctypes.byref(info), ctypes.sizeof(info)
        ):
            raise ctypes.WinError(ctypes.get_last_error())
        if info.attributes & FILE_ATTRIBUTE_REPARSE_POINT:
            raise FilesystemError(
                "FS_PERMISSION_DENIED",
                "Workspace paths cannot traverse reparse points.",
            )
        return handle, info.attributes
    except BaseException:
        kernel32.CloseHandle(handle)
        raise


@contextmanager
def _pin_directory(path: Path) -> Iterator[Path]:
    handle, attributes = _open_handle(path, GENERIC_READ)
    try:
        if not attributes & FILE_ATTRIBUTE_DIRECTORY:
            raise NotADirectoryError(errno.ENOTDIR, "Not a directory", str(path))
        yield path
    finally:
        kernel32.CloseHandle(handle)


@contextmanager
def open_directories(
    root: Path,
    parts: tuple[str, ...],
    create: bool,
    cancelled: Event | None,
) -> Iterator[Path]:
    root = root.absolute()
    with ExitStack() as handles:
        current = Path(root.anchor)
        handles.enter_context(_pin_directory(current))
        # Pin the ancestors too: validating a path alone leaves a junction-swap race.
        for name, managed in (
            *((name, False) for name in root.parts[1:]),
            *((name, True) for name in parts),
        ):
            if cancelled is not None:
                check_cancelled(cancelled, "write" if create else "read")
            if managed:
                validate_component(name)
            current /= name
            if managed and create:
                try:
                    current.mkdir(mode=0o700)
                except FileExistsError:
                    pass  # The pinned handle verifies the existing directory below.
            handles.enter_context(_pin_directory(current))
        yield current


@contextmanager
def open_regular_file(path: Path) -> Iterator[int]:
    handle, attributes = _open_handle(path, GENERIC_READ)
    try:
        if attributes & FILE_ATTRIBUTE_DIRECTORY:
            raise FilesystemError(
                "FS_NOT_REGULAR_FILE", "Cannot read a directory as a file."
            )
        descriptor = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
    except BaseException:
        kernel32.CloseHandle(handle)
        raise
    try:
        yield descriptor
    finally:
        os.close(descriptor)  # The CRT descriptor owns the native handle now.


def atomic_write(
    parent: Path,
    name: str,
    content: bytes,
    existing: os.stat_result | None,
    target: FsTarget,
    create_if_absent: bool,
    cancelled: Event,
) -> str:
    check_cancelled(cancelled, "write")
    staging = parent / f".{uuid4()}.tmpdir"
    staging.mkdir(mode=0o700)
    staged = staging / "content"
    committed = False
    try:
        with _pin_directory(staging):
            descriptor = os.open(
                staged, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_BINARY, 0o600
            )
            try:
                write_content(descriptor, content, cancelled)
                os.fsync(descriptor)
                staged_inode = os.fstat(descriptor).st_ino
            finally:
                os.close(descriptor)
            check_write_version(parent, name, existing, target, cancelled)
            if create_if_absent:
                try:
                    os.link(staged, parent / name)
                except FileExistsError as error:
                    collision = probe_at(parent, name)
                    if collision is not None and not stat.S_ISREG(collision.st_mode):
                        raise FilesystemError(
                            "FS_NOT_REGULAR_FILE",
                            "Cannot overwrite a non-regular file.",
                        ) from error
                    raise FilesystemError(
                        "FS_NOT_OBSERVED",
                        "Cannot overwrite an existing file without reading it first.",
                    ) from error
            else:
                os.replace(staged, parent / name)
            committed = True
    finally:
        try:
            staged.unlink(missing_ok=True)
            staging.rmdir()
        except OSError:
            if not committed:
                raise
            logger.exception(
                "Committed file staging cleanup failed for %s", target.display_path
            )
    after = probe_at(parent, name)
    if after is None or after.st_ino != staged_inode:
        raise FilesystemError("FS_STALE_VERSION", "File changed after publication.")
    return version_of(after)
