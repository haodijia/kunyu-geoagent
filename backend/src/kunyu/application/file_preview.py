"""Human file previews are scoped to the session, independent of Agent observation."""

import logging
from collections.abc import Callable, Generator
from dataclasses import dataclass
from pathlib import PurePosixPath
from threading import Event
from typing import Literal
from uuid import uuid4

from kunyu.application.attachment_preparation import normalize_image
from kunyu.domain.attachments import AttachmentError, FileAttachment
from kunyu.domain.filesystem import (
    Filesystem,
    FilesystemError,
    FilesystemScope,
    FsDirectoryListing,
    FsInfo,
    FsTarget,
)
from kunyu.domain.sessions import SessionRepository
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
            if not isinstance(ref, FileAttachment):
                raise FilesystemError(
                    "FS_INVALID_PATH",
                    "Use the image receipt endpoint to preview image attachments.",
                )
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
            "markdown"
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
            target.display_path, info.version, info.size, kind, state, threshold, text
        )

    def list_directory(self, session_id: str, path: str) -> FsDirectoryListing:
        return self._filesystem.list_directory(self._target(session_id, path), Event())

    def image(self, session_id: str, path: str, version: str) -> tuple[str, bytes]:
        target = self._target(session_id, path)
        info = self._info(target, version)
        extension = PurePosixPath(target.display_path).suffix.lower()
        if extension not in IMAGE_TYPES:
            raise FilesystemError(
                "FS_INVALID_PATH", "This is not a supported image preview path."
            )
        if info.size > IMAGE_LIMIT:
            raise FilesystemError(
                "FS_TOO_LARGE", "The image exceeds the preview size limit."
            )
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
