from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from kunyu.api.dependencies import get_database
from kunyu.application.sessions import (
    InvalidSessionTitleError,
    SessionNotFoundError,
    SessionService,
)
from kunyu.application.workspaces import WorkspaceNotFoundError
from kunyu.domain.sessions import Session
from kunyu.persistence.database import Database
from kunyu.persistence.sessions import SQLAlchemySessionRepository

router = APIRouter(prefix="/api/v1", tags=["sessions"])


class CreateSessionRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)


class SessionSummaryResponse(BaseModel):
    id: str
    workspace_id: str
    title: str
    archived: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, session: Session) -> "SessionSummaryResponse":
        return cls(
            id=session.id,
            workspace_id=session.workspace_id,
            title=session.title,
            archived=session.archived,
            created_at=session.created_at,
            updated_at=session.updated_at,
        )


def get_session_service(
    database: Annotated[Database, Depends(get_database)],
) -> SessionService:
    return SessionService(SQLAlchemySessionRepository(database))


SessionServiceDependency = Annotated[SessionService, Depends(get_session_service)]


@router.post(
    "/workspaces/{workspace_id}/sessions",
    response_model=SessionSummaryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_session(
    workspace_id: str,
    request: CreateSessionRequest,
    service: SessionServiceDependency,
) -> SessionSummaryResponse:
    try:
        session = service.create(workspace_id, request.title)
    except InvalidSessionTitleError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
    except WorkspaceNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error
    return SessionSummaryResponse.from_domain(session)


@router.get(
    "/workspaces/{workspace_id}/sessions",
    response_model=list[SessionSummaryResponse],
)
def list_sessions(
    workspace_id: str,
    service: SessionServiceDependency,
) -> list[SessionSummaryResponse]:
    try:
        sessions = service.list_for_workspace(workspace_id)
    except WorkspaceNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error
    return [SessionSummaryResponse.from_domain(item) for item in sessions]


@router.get("/sessions/archived", response_model=list[SessionSummaryResponse])
def list_archived_sessions(
    service: SessionServiceDependency,
) -> list[SessionSummaryResponse]:
    return [
        SessionSummaryResponse.from_domain(item) for item in service.list_archived()
    ]


class ArchiveSessionRequest(BaseModel):
    archived: bool


@router.post("/sessions/{session_id}/archive", response_model=SessionSummaryResponse)
def archive_session(
    session_id: str, request: ArchiveSessionRequest, service: SessionServiceDependency
) -> SessionSummaryResponse:
    try:
        return SessionSummaryResponse.from_domain(
            service.set_archived(session_id, request.archived)
        )
    except SessionNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/sessions/{session_id}", response_model=SessionSummaryResponse)
def get_session(
    session_id: str,
    service: SessionServiceDependency,
) -> SessionSummaryResponse:
    try:
        session = service.get(session_id)
    except SessionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error
    return SessionSummaryResponse.from_domain(session)
