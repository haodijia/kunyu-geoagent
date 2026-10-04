"""Authenticated session-owned file preview and original-byte download."""

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated, Literal
from urllib.parse import quote

from anyio import CancelScope
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from starlette.responses import Response, StreamingResponse
from starlette.types import Receive, Scope, Send

from kunyu.agent import services as s
from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.api.file_follow import FileWatchResponse
from kunyu.application.file_preview import FileDownload, FilePreviewService
from kunyu.domain.attachments import AttachmentError
from kunyu.domain.filesystem import FilesystemError
from kunyu.integrations.filesystem_operation import filesystem_operation
from kunyu.persistence.attachments import SQLAlchemyAttachmentStore
from kunyu.persistence.database import Database
from kunyu.persistence.sessions import SQLAlchemySessionRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/sessions/{session_id}/files", tags=["files"])
PathQuery = Annotated[str, Query(min_length=1, max_length=4096)]


class FilePreviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    path: str
    version: str
    bytes: int
    kind: Literal["markdown", "html", "code", "image", "unsupported"]
    state: Literal["ready", "oversized", "unsupported"]
    threshold_bytes: int | None
    text: str | None
    editable: bool


class FileSaveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str = Field(max_length=1024 * 1024)
    version: str = Field(min_length=1, max_length=512)


class DirectoryEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    type: Literal["file", "directory", "other"]
    size: int | None


class DirectoryListingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    path: str
    entries: list[DirectoryEntryResponse]
    truncated: bool


def get_file_service(
    request: Request, database: Annotated[Database, Depends(get_database)]
) -> FilePreviewService:
    return FilePreviewService(
        SQLAlchemySessionRepository(database),
        request.app.state.agent_kernel.context.require(s.FILESYSTEM),
        SQLAlchemyAttachmentStore(database),
    )


FilesDependency = Annotated[FilePreviewService, Depends(get_file_service)]


@contextmanager
def file_errors(session_id: str, operation: Literal["read", "save"]) -> Iterator[None]:
    try:
        yield
    except AttachmentError as error:
        logger.warning(
            "Attachment preview failed for session %s: %s", session_id, error
        )
        raise ApiError(error.status, error.code, str(error)) from error
    except FilesystemError as error:
        logger.warning("File delivery failed for session %s: %s", session_id, error)
        status = (
            503
            if error.code
            in {"FS_WATCH_UNSUPPORTED", "FS_WATCH_FAILED", "FS_WATCH_CLOSED"}
            else 404
            if error.code in {"FS_NOT_FOUND", "SESSION_NOT_FOUND"}
            else 403
            if error.code
            in {
                "FS_PERMISSION_DENIED",
                "FS_OUT_OF_SCOPE",
                "FS_NOT_ADMITTED",
                "FS_READ_ONLY",
            }
            else 409
            if error.code == "FS_STALE_VERSION"
            else 413
            if error.code == "FS_TOO_LARGE"
            else 422
        )
        raise ApiError(status, error.code, str(error)) from error
    except Exception:
        logger.exception("File delivery failed for session %s", session_id)
        code, message = (
            ("FILE_SAVE_FAILED", "The file could not be saved.")
            if operation == "save"
            else ("FILE_READ_FAILED", "The file could not be read.")
        )
        raise ApiError(503, code, message) from None


@router.get("/preview", response_model=FilePreviewResponse)
def preview_file(
    session_id: str, path: PathQuery, service: FilesDependency
) -> FilePreviewResponse:
    with file_errors(session_id, "read"):
        return FilePreviewResponse.model_validate(service.preview(session_id, path))


@router.put("/content", response_model=FilePreviewResponse)
async def save_file(
    session_id: str, path: PathQuery, body: FileSaveRequest, service: FilesDependency
) -> FilePreviewResponse:
    with file_errors(session_id, "save"):
        result = await filesystem_operation(
            lambda cancelled: service.save(
                session_id, path, body.text, body.version, cancelled
            )
        )
        return FilePreviewResponse.model_validate(result)


@router.get("/list", response_model=DirectoryListingResponse)
def list_directory(
    session_id: str, path: PathQuery, service: FilesDependency
) -> DirectoryListingResponse:
    with file_errors(session_id, "read"):
        return DirectoryListingResponse.model_validate(
            service.list_directory(session_id, path)
        )


class FileWatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    paths: list[Annotated[str, Field(min_length=1, max_length=4096)]] = Field(
        min_length=1, max_length=128
    )


@router.post("/changes")
async def watch_file(
    session_id: str, body: FileWatchRequest, service: FilesDependency
) -> Response:
    with file_errors(session_id, "read"):
        sources = await run_in_threadpool(service.watch, session_id, body.paths)
        return FileWatchResponse(session_id, sources)


@router.get("/image")
def preview_image(
    session_id: str,
    path: PathQuery,
    version: Annotated[str, Query(min_length=1)],
    service: FilesDependency,
) -> Response:
    with file_errors(session_id, "read"):
        media_type, data = service.image(session_id, path, version)
        return Response(
            data,
            media_type=media_type,
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )


class FileResponse(StreamingResponse):
    def __init__(self, download: FileDownload) -> None:
        self._download = download
        super().__init__(
            download.chunks,
            media_type="application/octet-stream",
            headers={
                "Content-Length": str(download.bytes),
                "Content-Disposition": f"attachment; filename*=UTF-8''{quote(download.name, safe='')}",
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            with CancelScope(shield=True):
                await run_in_threadpool(self._download.close)


@router.get("/download")
def download_file(
    session_id: str, path: PathQuery, service: FilesDependency
) -> Response:
    with file_errors(session_id, "read"):
        return FileResponse(service.download(session_id, path))
