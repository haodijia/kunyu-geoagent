"""Human file previews are scoped to the session, independent of Agent observation."""

import logging
from collections.abc import AsyncGenerator, Callable, Generator, Sequence
from dataclasses import dataclass
from pathlib import PurePosixPath
from threading import Event
from typing import Literal
from uuid import uuid4

from kunyu.application.attachment_preparation import normalize_image
from kunyu.domain.attachments import AttachmentError, ImageAttachment
from kunyu.domain.filesystem import (
    Filesystem,
    FilesystemError,
    FilesystemScope,
    FsDirectoryListing,
    FsInfo,
    FsTarget,
    FsWatchFrame,
    FsWriteIntent,
)
from kunyu.domain.sessions import SessionRepository
from kunyu.integrations.search_storage import SEARCH_DIRECTORY
from kunyu.persistence.attachments import SQLAlchemyAttachmentStore

logger = logging.getLogger(__name__)
TEXT_LIMIT = 1024 * 1024
IMAGE_LIMIT = 20 * 1024 * 1024
IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}
UNSUPPORTED = {
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".odt",
    ".ods",
    ".odp",
    ".docm",
    ".xlsm",
    ".pptm",
    ".heic",
    ".svg",
    ".tif",
    ".tiff",
    ".zip",
    ".gz",
    ".bin",
}


@dataclass(frozen=True, slots=True)
class FilePreview:
    path: str
    version: str
    bytes: int
    kind: Literal["markdown", "html", "code", "image", "unsupported"]
    state: Literal["ready", "oversized", "unsupported"]
    threshold_bytes: int | None
    text: str | None
    editable: bool


@dataclass(frozen=True, slots=True)
class FileDownload:
    name: str
    bytes: int
    chunks: Generator[bytes]
    close: Callable[[], None]


class FilePreviewService:
    def __init__(
        self,
        sessions: SessionRepository,
        filesystem: Filesystem,
        attachments: SQLAlchemyAttachmentStore,
    ) -> None:
        self._sessions, self._filesystem, self._attachments = (
            sessions,
            filesystem,
            attachments,
        )

    def _target(self, session_id: str, path: str) -> FsTarget:
        session = self._sessions.get(session_id)
        if session is None:
            raise FilesystemError(
                "SESSION_NOT_FOUND", "The file's session does not exist."
            )
        attachments = ()
        if path.startswith("/attachments/"):
            parts = path.split("/")
            if len(parts) != 4:
                raise FilesystemError(
                    "FS_INVALID_PATH", "Invalid attachment file path."
                )
            ref = self._attachments.resolve(session_id, (parts[2],))[0]
            attachments = (ref,)
        return self._filesystem.resolve(
            path, FilesystemScope(session.workspace_id, session.id, attachments)
        )

    def _info(self, target: FsTarget, expected: str | None = None) -> FsInfo:
        info = self._filesystem.stat(target, Event())
        if info is None:
            raise FilesystemError("FS_NOT_FOUND", "The file no longer exists.")
        if info.kind != "file" or info.size is None:
            raise FilesystemError(
                "FS_NOT_REGULAR_FILE",
                "Only regular files can be previewed or downloaded.",
            )
        if expected is not None and info.version != expected:
            raise FilesystemError(
                "FS_STALE_VERSION",
                "The file changed; refresh its preview before reading it again.",
            )
        return info

    def _read(self, target: FsTarget, info: FsInfo, cap: int) -> bytes:
        data = bytearray()
        stream = self._filesystem.stream_bytes(target, Event())
        try:
            for chunk in stream:
                if len(data) + len(chunk) > cap:
                    raise FilesystemError(
                        "FS_TOO_LARGE", "The file exceeds the preview size limit."
                    )
                data.extend(chunk)
        finally:
            stream.close()
        self._info(target, info.version)
        if len(data) != info.size:
            raise FilesystemError(
                "FS_STALE_VERSION", "The file size changed while reading it."
            )
        return bytes(data)

    def preview(self, session_id: str, path: str) -> FilePreview:
        target = self._target(session_id, path)
        info = self._info(target)
        extension = PurePosixPath(target.display_path).suffix.lower()
        kind = (
            "image"
            if isinstance(target.attachment, ImageAttachment)
            else "markdown"
            if extension in {".md", ".markdown"}
            else "html"
            if extension in {".html", ".htm"}
            else "image"
            if extension in IMAGE_TYPES
            else "unsupported"
            if extension in UNSUPPORTED
            else "code"
        )
        threshold = (
            IMAGE_LIMIT
            if kind == "image"
            else None
            if kind == "unsupported"
            else TEXT_LIMIT
        )
        state = (
            "unsupported"
            if kind == "unsupported"
            else "oversized"
            if info.size > threshold
            else "ready"
        )
        text = None
        if state == "ready" and kind != "image":
            raw = self._read(target, info, threshold)
            if b"\x00" in raw[:8192]:
                raise FilesystemError(
                    "FS_NOT_TEXT",
                    "This file contains binary data and cannot be previewed as text.",
                )
            try:
                text = raw.decode("utf-8-sig")
            except UnicodeDecodeError as error:
                raise FilesystemError(
                    "FS_NOT_TEXT", "This file is not valid UTF-8 text."
                ) from error
        return FilePreview(
            target.display_path,
            info.version,
            info.size,
            kind,
            state,
            threshold,
            text,
            state == "ready"
            and kind in {"code", "markdown", "html"}
            and target.kind == "workspace"
            and target.parts[0].casefold() != SEARCH_DIRECTORY,
        )

    def save(
        self, session_id: str, path: str, text: str, version: str, cancelled: Event
    ) -> FilePreview:
        target = self._target(session_id, path)
        if target.kind != "workspace" or (
            target.parts and target.parts[0].casefold() == SEARCH_DIRECTORY
        ):
            raise FilesystemError("FS_READ_ONLY", "This file mount is read-only.")
        if not target.parts:
            raise FilesystemError(
                "FS_NOT_REGULAR_FILE", "The workspace root is not an editable file."
            )
        try:
            size = len(text.encode("utf-8"))
        except UnicodeEncodeError as error:
            raise FilesystemError(
                "FS_NOT_TEXT", "The edited text is not valid UTF-8."
            ) from error
        if "\x00" in text:
            raise FilesystemError("FS_NOT_TEXT", "Text files cannot contain NUL bytes.")
        if size > TEXT_LIMIT:
            raise FilesystemError(
                "FS_TOO_LARGE", "The edited text exceeds the preview size limit."
            )
        info = self._filesystem.stat(target, cancelled)
        if info is None or info.version != version:
            raise FilesystemError(
                "FS_STALE_VERSION", "The file changed; the edited text was not saved."
            )
        preview = self.preview(session_id, target.display_path)
        if preview.version != version:
            raise FilesystemError(
                "FS_STALE_VERSION", "The file changed; the edited text was not saved."
            )
        if not preview.editable:
            raise FilesystemError(
                "FS_NOT_TEXT", "Only complete text previews can be edited."
            )
        outcome = self._filesystem.write_text(
            target, text, FsWriteIntent("replace_if_version", version), cancelled
        )
        return FilePreview(
            target.display_path,
            outcome.version,
            size,
            preview.kind,
            "ready",
            TEXT_LIMIT,
            text,
            True,
        )

    def list_directory(self, session_id: str, path: str) -> FsDirectoryListing:
        return self._filesystem.list_directory(self._target(session_id, path), Event())

    def watch(
        self, session_id: str, paths: Sequence[str]
    ) -> dict[str, AsyncGenerator[FsWatchFrame, None]]:
        targets = [self._target(session_id, path) for path in paths]
        if len({target.display_path for target in targets}) != len(targets):
            raise FilesystemError(
                "FS_INVALID_PATH", "Duplicate watch paths are not allowed."
            )
        return {
            target.display_path: self._filesystem.watch(target) for target in targets
        }

    def image(self, session_id: str, path: str, version: str) -> tuple[str, bytes]:
        target = self._target(session_id, path)
        info = self._info(target, version)
        extension = PurePosixPath(target.display_path).suffix.lower()
        if extension not in IMAGE_TYPES and not isinstance(
            target.attachment, ImageAttachment
        ):
            raise FilesystemError(
                "FS_INVALID_PATH", "This is not a supported image preview path."
            )
        if info.size > IMAGE_LIMIT:
            raise FilesystemError(
                "FS_TOO_LARGE", "The image exceeds the preview size limit."
            )
        if isinstance(target.attachment, ImageAttachment):
            return target.attachment.media_type, self._read(target, info, IMAGE_LIMIT)
        ref, data = normalize_image(
            str(uuid4()),
            PurePosixPath(path).name,
            IMAGE_TYPES[extension],
            self._read(target, info, IMAGE_LIMIT),
        )
        return ref.media_type, data

    def download(self, session_id: str, path: str) -> FileDownload:
        target = self._target(session_id, path)
        info = self._info(target)
        stream = self._filesystem.stream_bytes(target, Event())
        try:
            # Acquire the actual file before committing HTTP response headers.
            first = next(stream, b"")
            self._info(target, info.version)
        except BaseException:
            stream.close()
            raise

        def chunks() -> Generator[bytes]:
            count = 0
            try:
                if first:
                    count += len(first)
                    yield first
                for chunk in stream:
                    count += len(chunk)
                    if count > info.size:
                        raise FilesystemError(
                            "FS_STALE_VERSION", "The file grew during its download."
                        )
                    yield chunk
                if count != info.size:
                    raise FilesystemError(
                        "FS_STALE_VERSION", "The file changed during its download."
                    )
            except (FilesystemError, OSError, AttachmentError):
                logger.exception(
                    "File download failed for session %s, path %s",
                    session_id,
                    target.display_path,
                )
                raise
            finally:
                stream.close()

        output = chunks()

        def close() -> None:
            output.close()
            stream.close()

        return FileDownload(
            PurePosixPath(target.display_path).name, info.size, output, close
        )
