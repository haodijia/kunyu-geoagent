"""Explicit workspace and admitted-attachment mounts with bounded UTF-8 streaming."""

import codecs
import os
import posixpath
import re
import stat
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from pathlib import Path
from threading import Event

from kunyu.domain.attachments import AttachmentError, attachment_path
from kunyu.domain.filesystem import FilesystemError, FilesystemScope, ReadTarget
from kunyu.persistence.attachments import SQLAlchemyAttachmentStore

CHUNK_BYTES = 64 * 1024
BINARY_SAMPLE_BYTES = 8192


class MountedFilesystem:
    def __init__(
        self, data_directory: Path, attachments: SQLAlchemyAttachmentStore
    ) -> None:
        self._root = data_directory.resolve()
        self._attachments = attachments

    def resolve(self, file_path: str, scope: FilesystemScope) -> ReadTarget:
        if (
            not isinstance(file_path, str)
            or not file_path.strip()
            or len(file_path) > 4096
            or "\x00" in file_path
        ):
            raise FilesystemError(
                "FS_INVALID_PATH",
                "file_path must be a non-empty path of at most 4096 characters.",
            )
        if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", scope.workspace_id) is None:
            raise FilesystemError(
                "FS_INVALID_SCOPE", "The workspace filesystem scope is invalid."
            )
        if file_path.startswith("/attachments/"):
            for ref in scope.attachments:
                if file_path == attachment_path(ref):
                    return ReadTarget(file_path, scope, "attachment", (), ref)
            raise FilesystemError(
                "FS_NOT_ADMITTED",
                "The attachment path was not admitted into this run's current history.",
            )
        path = posixpath.normpath(
            file_path if file_path.startswith("/") else f"/workspace/{file_path}"
        )
        if path == "/workspace":
            raise FilesystemError(
                "FS_NOT_REGULAR_FILE", 'cannot read "/workspace": not a regular file'
            )
        if not path.startswith("/workspace/"):
            raise FilesystemError(
                "FS_OUT_OF_SCOPE",
                "Paths must stay inside /workspace or reference an admitted /attachments path.",
            )
        return ReadTarget(
            path, scope, "workspace", tuple(path[len("/workspace/") :].split("/")), None
        )

    def stream_text(self, target: ReadTarget, cancelled: Event) -> Generator[str]:
        decoder = codecs.getincrementaldecoder("utf-8-sig")(errors="strict")
        sampled_bytes = 0
        chunks = self._bytes(target, cancelled)
        try:
            for chunk in chunks:
                sample = chunk[: max(0, BINARY_SAMPLE_BYTES - sampled_bytes)]
                sampled_bytes += len(sample)
                if b"\x00" in sample:
                    raise FilesystemError(
                        "FS_NOT_TEXT",
                        f'cannot read "{target.display_path}": binary file',
                    )
                yield decoder.decode(chunk)
            yield decoder.decode(b"", final=True)
        except UnicodeDecodeError as error:
            raise FilesystemError(
                "FS_NOT_TEXT",
                f'cannot read "{target.display_path}": invalid UTF-8 text',
            ) from error
        except AttachmentError as error:
            raise FilesystemError(error.code, str(error)) from error
        except OSError as error:
            raise FilesystemError(
                "FS_READ_FAILED",
                f'cannot read "{target.display_path}": {error.strerror}',
            ) from error
        finally:
            chunks.close()

    def _bytes(self, target: ReadTarget, cancelled: Event) -> Iterator[bytes]:
        if cancelled.is_set():
            raise FilesystemError("FS_ABORTED", "read aborted")
        if target.kind == "attachment":
            if (
                target.attachment is None
                or target.attachment not in target.scope.attachments
            ):
                raise FilesystemError(
                    "FS_INVALID_TARGET",
                    "The attachment target has no admitted receipt.",
                )
            stored, data = self._attachments.read(
                target.scope.session_id, target.attachment.id
            )
            if stored != target.attachment:
                raise FilesystemError(
                    "FS_RECEIPT_MISMATCH",
                    "The attachment receipt differs from committed history.",
                )
            for start in range(0, len(data), CHUNK_BYTES):
                if cancelled.is_set():
                    raise FilesystemError("FS_ABORTED", "read aborted")
                yield data[start : start + CHUNK_BYTES]
            return
        if target.kind != "workspace" or target.attachment is not None:
            raise FilesystemError(
                "FS_INVALID_TARGET", "The filesystem target is invalid."
            )
        with self._open_file(target) as descriptor:
            while True:
                if cancelled.is_set():
                    raise FilesystemError("FS_ABORTED", "read aborted")
                chunk = os.read(descriptor, CHUNK_BYTES)
                if not chunk:
                    break
                yield chunk

    @contextmanager
    def _open_file(self, target: ReadTarget) -> Iterator[int]:
        if (
            re.fullmatch(r"[A-Za-z0-9_-]{1,64}", target.scope.workspace_id) is None
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
        directories = (
            "workspaces",
            target.scope.workspace_id,
            "files",
            *target.parts[:-1],
        )
        descriptors = []
        try:
            descriptor = os.open(
                self._root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
            )
            descriptors.append(descriptor)
            for name in directories:
                descriptor = os.open(
                    name,
                    os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                    dir_fd=descriptor,
                )
                descriptors.append(descriptor)
            descriptor = os.open(
                target.parts[-1],
                os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                dir_fd=descriptor,
            )
            descriptors.append(descriptor)
            if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                raise FilesystemError(
                    "FS_NOT_REGULAR_FILE",
                    f'cannot read "{target.display_path}": not a regular file',
                )
            yield descriptor
        except FileNotFoundError as error:
            raise FilesystemError(
                "FS_NOT_FOUND", f'cannot read "{target.display_path}": not found'
            ) from error
        finally:
            for descriptor in reversed(descriptors):
                os.close(descriptor)
