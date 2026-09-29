from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field

from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.application.workspaces import (
    InvalidWorkspaceNameError,
    WorkspaceNotFoundError,
    WorkspaceService,
)
from kunyu.domain.runs import UnfinishedRunConflictError
from kunyu.domain.workspaces import Workspace
from kunyu.persistence.database import Database
from kunyu.persistence.workspaces import SQLAlchemyWorkspaceRepository

router = APIRouter(prefix="/api/v1/workspaces", tags=["workspaces"])


class CreateWorkspaceRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=200)


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, workspace: Workspace) -> "WorkspaceResponse":
        return cls(
            id=workspace.id,
            name=workspace.name,
            created_at=workspace.created_at,
            updated_at=workspace.updated_at,
        )


def get_workspace_service(
    database: Annotated[Database, Depends(get_database)],
) -> WorkspaceService:
    return WorkspaceService(SQLAlchemyWorkspaceRepository(database))


WorkspaceServiceDependency = Annotated[WorkspaceService, Depends(get_workspace_service)]


@router.post(
    "",
    response_model=WorkspaceResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_workspace(
    request: CreateWorkspaceRequest,
    service: WorkspaceServiceDependency,
) -> WorkspaceResponse:
    try:
        workspace = service.create(request.name)
    except InvalidWorkspaceNameError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
    return WorkspaceResponse.from_domain(workspace)


@router.get("", response_model=list[WorkspaceResponse])
def list_workspaces(service: WorkspaceServiceDependency) -> list[WorkspaceResponse]:
    return [WorkspaceResponse.from_domain(item) for item in service.list()]


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
def get_workspace(
    workspace_id: str,
    service: WorkspaceServiceDependency,
) -> WorkspaceResponse:
    try:
        workspace = service.get(workspace_id)
    except WorkspaceNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error
    return WorkspaceResponse.from_domain(workspace)


@router.delete("/{workspace_id}", status_code=204)
def remove_workspace(
    workspace_id: str, service: WorkspaceServiceDependency
) -> Response:
    try:
        service.remove(workspace_id)
    except WorkspaceNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except UnfinishedRunConflictError as error:
        raise ApiError(409, "RUN_CONFLICT", str(error)) from error
    return Response(status_code=204)
