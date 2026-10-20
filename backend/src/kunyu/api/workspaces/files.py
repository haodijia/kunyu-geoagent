"""Original-byte workspace uploads; the returned virtual path is model-readable."""

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.application.workspaces.files import (
    WorkspaceFileService,
    WorkspaceFileTooLargeError,
)
from kunyu.application.workspaces.service import WorkspaceNotFoundError
from kunyu.domain.workspaces.filesystem import FilesystemError
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
