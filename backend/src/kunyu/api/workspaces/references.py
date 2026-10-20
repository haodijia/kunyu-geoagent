"""Search resources by name and return tool-readable paths."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.application.workspaces.references import (
    WorkspaceReferences,
)
from kunyu.application.workspaces.service import WorkspaceNotFoundError
from kunyu.domain.workspaces.workspace_files import WorkspaceResource
from kunyu.persistence.database import Database

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/references", tags=["workspace-references"]
)


@router.get("", response_model=list[WorkspaceResource])
async def references(
    workspace_id: str,
    database: Annotated[Database, Depends(get_database)],
    query: Annotated[str, Query(max_length=255)] = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[WorkspaceResource]:
    try:
        return await WorkspaceReferences(database).search(workspace_id, query, limit)
    except WorkspaceNotFoundError as error:
        raise ApiError(
            404, "WORKSPACE_NOT_FOUND", "Workspace is unavailable."
        ) from error
