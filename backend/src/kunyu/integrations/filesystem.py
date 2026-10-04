"""Explicit workspace and admitted-attachment mounts with bounded UTF-8 streaming."""

import codecs
import os
import posixpath
import re
import stat
from collections import deque
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from pathlib import Path
from threading import Event, Lock

from kunyu.domain.attachments import AttachmentError, FileAttachment, attachment_path
from kunyu.domain.filesystem import (
    FilesystemError,
    FilesystemScope,
    FsEditRequest,
    FsInfo,
    FsMutationOutcome,
    FsTarget,
    FsWriteIntent,
)
from kunyu.integrations.filesystem_io import (
    atomic_write,
    check_cancelled,
    io_error,
    open_file,
    open_parent,
    probe_at,
    version_of,
)
from kunyu.integrations.search_storage import SEARCH_DIRECTORY, search_artifact_parts
from kunyu.persistence.attachments import SQLAlchemyAttachmentStore

CHUNK_BYTES = 64 * 1024
BINARY_SAMPLE_BYTES = 8192
DIFF_BASIS_MAX_BYTES = 10 * 1024 * 1024


class MountedFilesystem:
    def __init__(
        self, data_directory: Path, attachments: SQLAlchemyAttachmentStore
    ) -> None:
        self._root = data_directory.resolve()
        self._attachments = attachments
        self._locks_guard = Lock()
        self._locks: dict[tuple[str, str], deque[Event]] = {}

    def resolve(self, file_path: str, scope: FilesystemScope) -> FsTarget:
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
                    return FsTarget(file_path, scope, "attachment", (), ref)
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
        parts = tuple(path[len("/workspace/") :].split("/"))
        if parts[0].casefold() == SEARCH_DIRECTORY and not search_artifact_parts(
            parts, scope
        ):
            raise FilesystemError(
                "FS_PERMISSION_DENIED",
                "Search recovery artifacts belong to their originating session.",
            )
        return FsTarget(path, scope, "workspace", parts, None)

    def stream_text(self, target: FsTarget, cancelled: Event) -> Generator[str]:
        decoder = codecs.getincrementaldecoder("utf-8-sig")(errors="strict")
        sampled_bytes = 0
        chunks = self.stream_bytes(target, cancelled)
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
                io_error(error, target.display_path, "read").code,
                str(io_error(error, target.display_path, "read")),
            ) from error
        finally:
            chunks.close()

    def stream_bytes(self, target: FsTarget, cancelled: Event) -> Generator[bytes]:
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
        with open_file(self._root, target) as descriptor:
            while True:
                if cancelled.is_set():
                    raise FilesystemError("FS_ABORTED", "read aborted")
                chunk = os.read(descriptor, CHUNK_BYTES)
                if not chunk:
                    break
                yield chunk

    def stat(self, target: FsTarget, cancelled: Event) -> FsInfo | None:
        check_cancelled(cancelled, "stat")
        if target.kind == "attachment":
            ref = self._attachment(target)
            return FsInfo(f"attachment:{ref.id}:{ref.bytes}", "file", ref.bytes)
        try:
            with open_parent(self._root, target, cancelled=cancelled) as parent:
                info = probe_at(parent, target.parts[-1])
            check_cancelled(cancelled, "stat")
            if info is None:
                return None
            kind = (
                "file"
                if stat.S_ISREG(info.st_mode)
                else "directory"
                if stat.S_ISDIR(info.st_mode)
                else "other"
            )
            return FsInfo(
                version_of(info), kind, info.st_size if kind == "file" else None
            )
        except FileNotFoundError:
            return None
        except OSError as error:
            raise io_error(error, target.display_path, "stat") from error

    def read_text(self, target: FsTarget, cancelled: Event) -> str:
        return "".join(self.stream_text(target, cancelled))

    def _attachment(self, target: FsTarget) -> FileAttachment:
        if (
            target.attachment is None
            or target.attachment not in target.scope.attachments
            or target.parts
            or target.display_path != attachment_path(target.attachment)
        ):
            raise FilesystemError(
                "FS_INVALID_TARGET", "The attachment target has no admitted receipt."
            )
        try:
            stored = self._attachments.resolve(
                target.scope.session_id, (target.attachment.id,)
            )[0]
        except AttachmentError as error:
            raise FilesystemError(error.code, str(error)) from error
        if stored != target.attachment:
            raise FilesystemError(
                "FS_RECEIPT_MISMATCH",
                "The attachment receipt differs from committed history.",
            )
        assert isinstance(stored, FileAttachment)
        return stored

    @contextmanager
    def _locked(self, target: FsTarget, cancelled: Event) -> Iterator[None]:
        ready = Event()
        with self._locks_guard:
            queue = self._locks.setdefault(target.key, deque())
            queue.append(ready)
            if len(queue) == 1:
                ready.set()
        try:
            while not ready.wait(timeout=0.05):
                check_cancelled(cancelled, "write")
            check_cancelled(cancelled, "write")
            yield
        finally:
            with self._locks_guard:
                first = queue[0] is ready
                queue.remove(ready)
                if not queue:
                    del self._locks[target.key]
                elif first:
                    queue[0].set()

    def write_text(
        self,
        target: FsTarget,
        content: str,
        intent: FsWriteIntent | None,
        cancelled: Event,
    ) -> FsMutationOutcome:
        self._require_writable(target)
        try:
            with (
                self._locked(target, cancelled),
                open_parent(
                    self._root, target, create=True, cancelled=cancelled
                ) as parent,
            ):
                existing = probe_at(parent, target.parts[-1])
                self._regular(existing, target, "write")
                if intent is not None and intent.kind == "replace_if_version":
                    if existing is None or version_of(existing) != intent.version:
                        raise FilesystemError(
                            "FS_STALE_VERSION",
                            f'cannot write "{target.display_path}": file changed since it was read',
                        )
                elif intent is not None and existing is not None:
                    raise FilesystemError(
                        "FS_NOT_OBSERVED",
                        f'cannot overwrite existing "{target.display_path}" without reading it first',
                    )
                before = None
                if (
                    existing is not None
                    and len(content.encode("utf-8")) < DIFF_BASIS_MAX_BYTES
                    and existing.st_size < DIFF_BASIS_MAX_BYTES
                ):
                    raw = self._read_for_mutation(
                        target, cancelled, max_bytes=DIFF_BASIS_MAX_BYTES
                    )
                    if b"\x00" not in raw:
                        try:
                            before = raw.decode("utf-8-sig").replace("\r\n", "\n")
                        except UnicodeDecodeError:
                            before = None  # Binary files have no text diff basis.
                version = atomic_write(
                    parent,
                    target.parts[-1],
                    content,
                    existing,
                    target,
                    intent is not None and intent.kind == "create_if_absent",
                    cancelled,
                )
                return FsMutationOutcome(
                    "create" if existing is None else "update",
                    version,
                    before,
                    content.replace("\r\n", "\n"),
                )
        except OSError as error:
            raise io_error(error, target.display_path, "write") from error

    def edit_text(
        self,
        target: FsTarget,
        edit: FsEditRequest,
        version: str | None,
        cancelled: Event,
    ) -> FsMutationOutcome:
        self._require_writable(target)
        try:
            with (
                self._locked(target, cancelled),
                open_parent(self._root, target, cancelled=cancelled) as parent,
            ):
                existing = probe_at(parent, target.parts[-1])
                self._regular(existing, target, "edit")
                if existing is None or (
                    version is not None and version_of(existing) != version
                ):
                    raise FilesystemError(
                        "FS_STALE_VERSION",
                        f'cannot edit "{target.display_path}": file changed since it was read',
                    )
                raw = self._read_for_mutation(target, cancelled)
                if b"\x00" in raw:
                    raise FilesystemError(
                        "FS_NOT_TEXT",
                        f'cannot edit "{target.display_path}": binary file',
                    )
                try:
                    text = raw.decode("utf-8-sig")
                except UnicodeDecodeError as error:
                    raise FilesystemError(
                        "FS_NOT_TEXT",
                        f'cannot edit "{target.display_path}": invalid UTF-8 text',
                    ) from error
                before = text.replace("\r\n", "\n")
                after = apply_literal_edit(before, edit, target.display_path)
                # The harness samples 4096 UTF-16 code units before normalization.
                sample = text.encode("utf-16-le")[:8192].decode(
                    "utf-16-le", errors="replace"
                )
                crlf = sample.count("\r\n")
                storage = (
                    after.replace("\n", "\r\n")
                    if crlf > sample.count("\n") - crlf
                    else after
                )
                updated = atomic_write(
                    parent,
                    target.parts[-1],
                    storage,
                    existing,
                    target,
                    False,
                    cancelled,
                )
                return FsMutationOutcome("update", updated, before, after)
        except FileNotFoundError as error:
            raise FilesystemError(
                "FS_STALE_VERSION",
                f'cannot edit "{target.display_path}": file changed since it was read',
            ) from error
        except OSError as error:
            raise io_error(error, target.display_path, "edit") from error

    def _read_for_mutation(
        self, target: FsTarget, cancelled: Event, *, max_bytes: int | None = None
    ) -> bytes:
        data = bytearray()
        with open_file(self._root, target) as descriptor:
            while True:
                check_cancelled(cancelled, "edit")
                chunk = os.read(descriptor, CHUNK_BYTES)
                if not chunk:
                    return bytes(data)
                if max_bytes is not None and len(data) + len(chunk) >= max_bytes:
                    raise FilesystemError(
                        "FS_TOO_LARGE",
                        f'cannot read "{target.display_path}": file grew past the diff basis boundary',
                    )
                data.extend(chunk)

    @staticmethod
    def _require_writable(target: FsTarget) -> None:
        if target.kind != "workspace" or (
            target.parts and target.parts[0].casefold() == SEARCH_DIRECTORY
        ):
            raise FilesystemError(
                "FS_PERMISSION_DENIED",
                f'cannot modify "{target.display_path}": this mount is read-only',
            )

    @staticmethod
    def _regular(info: os.stat_result | None, target: FsTarget, verb: str) -> None:
        if info is not None and not stat.S_ISREG(info.st_mode):
            raise FilesystemError(
                "FS_NOT_REGULAR_FILE",
                f'cannot {verb} "{target.display_path}": not a regular file',
            )


def apply_literal_edit(content: str, edit: FsEditRequest, path: str) -> str:
    old = edit.old_string.replace("\r\n", "\n")
    new = edit.new_string.replace("\r\n", "\n")
    if not old:
        raise FilesystemError(
            "FS_EDIT_NOT_FOUND", "old_string must be a non-empty string"
        )
    count = content.count(old)
    if count == 0:
        raise FilesystemError(
            "FS_EDIT_NOT_FOUND", f'old_string was not found in "{path}"'
        )
    if not edit.replace_all and count > 1:
        raise FilesystemError(
            "FS_AMBIGUOUS_EDIT",
            f'old_string matched {count} times in "{path}"; provide a more specific old_string or set replace_all to true',
        )
    return content.replace(old, new)
