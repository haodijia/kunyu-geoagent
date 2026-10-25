from typing import Annotated

from fastapi import APIRouter, Depends

from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.application.workspaces.overview import WorkspaceOverviewService
from kunyu.application.workspaces.service import WorkspaceNotFoundError
from kunyu.domain.workspaces.overview import WorkspaceOverviewData
from kunyu.persistence.database import Database

router = APIRouter(prefix="/api/v1/workspaces", tags=["workspace-overview"])


@router.get("/{workspace_id}/overview", response_model=WorkspaceOverviewData)
def read_workspace_overview(
    workspace_id: str,
    database: Annotated[Database, Depends(get_database)],
) -> WorkspaceOverviewData:
    try:
        return WorkspaceOverviewService(database).read(workspace_id)
    except WorkspaceNotFoundError as error:
        raise ApiError(404, "WORKSPACE_NOT_FOUND", str(error)) from error
