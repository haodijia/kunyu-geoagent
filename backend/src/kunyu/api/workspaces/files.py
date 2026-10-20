"""Original-byte workspace uploads; the returned virtual path is model-readable."""

import logging
from collections.abc import Iterator
from contextlib import ExitStack
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.application.workspaces.files import (
    WorkspaceFileService,
    WorkspaceFileTooLargeError,
)
from kunyu.application.workspaces.service import WorkspaceNotFoundError
from kunyu.domain.workspaces.filesystem import FilesystemError
from kunyu.domain.workspaces.workspace_files import WorkspaceContent, WorkspaceListing
from kunyu.persistence.database import Database

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/files", tags=["workspace-files"]
)


class WorkspaceFileResponse(BaseModel):
    name: str
    file_path: str
    bytes: int
    kind: Literal["file", "image"]


def get_file_service(
    database: Annotated[Database, Depends(get_database)],
) -> WorkspaceFileService:
    return WorkspaceFileService(database)


FileService = Annotated[WorkspaceFileService, Depends(get_file_service)]


def file_error(error: WorkspaceNotFoundError | FilesystemError) -> ApiError:
    if isinstance(error, WorkspaceNotFoundError):
        return ApiError(404, "WORKSPACE_NOT_FOUND", "Workspace is unavailable.")
    status = {
        "FS_NOT_FOUND": 404,
        "FS_NOT_DIRECTORY": 422,
        "FS_NOT_REGULAR_FILE": 422,
        "FS_INVALID_PATH": 422,
        "FS_INVALID_SCOPE": 422,
        "FS_OUT_OF_SCOPE": 403,
        "FS_PERMISSION_DENIED": 403,
        "FS_PREVIEW_TOO_LARGE": 413,
    }.get(error.code, 503)
    if status >= 500:
        logger.error("Workspace file access failed: %s", error)
    return ApiError(status, error.code, str(error))


@router.get("", response_model=WorkspaceListing)
async def list_workspace_files(
    workspace_id: str,
    service: FileService,
    file_path: Annotated[str, Query(min_length=1, max_length=4096)] = "/workspace",
) -> WorkspaceListing:
    try:
        return await service.list(workspace_id, file_path)
    except (WorkspaceNotFoundError, FilesystemError) as error:
        raise file_error(error) from error


def open_workspace_file(
    workspace_id: str,
    service: FileService,
    file_path: Annotated[str, Query(min_length=1, max_length=4096)],
    max_bytes: Annotated[int | None, Query(ge=1, le=64 * 1024 * 1024)] = None,
) -> Iterator[WorkspaceContent]:
    with ExitStack() as stack:
        try:
            content = stack.enter_context(
                service.open(workspace_id, file_path, max_bytes)
            )
        except (WorkspaceNotFoundError, FilesystemError) as error:
            raise file_error(error) from error
        try:
            yield content
        except Exception:
            logger.exception("Workspace file delivery failed: %s", file_path)
            raise


@router.get("/content")
def read_workspace_file(
    content: Annotated[WorkspaceContent, Depends(open_workspace_file)],
) -> StreamingResponse:
    return StreamingResponse(
        content.chunks,
        media_type=content.media_type,
        headers={
            "Content-Length": str(content.bytes),
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(content.name, safe='')}",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("", response_model=WorkspaceFileResponse, status_code=201)
async def upload_workspace_file(
    workspace_id: str,
    request: Request,
    name: Annotated[str, Query(min_length=1, max_length=255)],
    kind: Literal["file", "image"],
    service: Annotated[WorkspaceFileService, Depends(get_file_service)],
) -> WorkspaceFileResponse:
    if request.headers.get("content-type") != "application/octet-stream":
        raise ApiError(
            415,
            "WORKSPACE_FILE_CONTENT_TYPE",
            "Upload original file bytes as application/octet-stream.",
        )
    try:
        uploaded = await service.upload(workspace_id, name, kind, request.stream())
    except WorkspaceNotFoundError as error:
        raise ApiError(
            404, "WORKSPACE_NOT_FOUND", "Workspace is unavailable."
        ) from error
    except WorkspaceFileTooLargeError as error:
        raise ApiError(413, "WORKSPACE_FILE_TOO_LARGE", str(error)) from error
    except FilesystemError as error:
        if error.code == "FS_INVALID_PATH":
            raise ApiError(422, "WORKSPACE_FILE_NAME_INVALID", str(error)) from error
        logger.exception("Workspace file storage failed for %s", workspace_id)
        raise ApiError(
            503,
            "WORKSPACE_FILE_STORAGE_FAILED",
            "The file could not be saved to this workspace.",
        ) from error
    except Exception:
        logger.exception("Workspace file publication failed for %s", workspace_id)
        raise ApiError(
            503,
            "WORKSPACE_FILE_STORAGE_FAILED",
            "The file could not be saved to this workspace.",
        ) from None
    return WorkspaceFileResponse(
        name=uploaded.name,
        file_path=uploaded.file_path,
        bytes=uploaded.bytes,
        kind=uploaded.kind,
    )
