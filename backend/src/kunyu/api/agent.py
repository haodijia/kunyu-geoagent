"""Session-scoped Agent state and lifecycle API."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict

from kunyu.agent.scheduler import (
    RunQueueFullError,
    RunScheduler,
    RunSchedulerClosingError,
)
from kunyu.agent.session_agent import AgentDirectory, SessionAgentIdleError
from kunyu.api.errors import ApiError
from kunyu.api.run_models import AgentTurnResponse
from kunyu.application.run_lifecycle import RunLifecycleConflictError
from kunyu.application.sessions import SessionNotFoundError
from kunyu.domain.confirmations import ConfirmationConflictError

router = APIRouter(prefix="/api/v1/sessions/{session_id}/agent", tags=["agent"])


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


def get_run_scheduler(request: Request) -> RunScheduler:
    return request.app.state.run_scheduler


RunSchedulerDependency = Annotated[RunScheduler, Depends(get_run_scheduler)]


def get_agent_directory(request: Request) -> AgentDirectory:
    return request.app.state.agent_directory


AgentDirectoryDependency = Annotated[AgentDirectory, Depends(get_agent_directory)]


@router.get("", response_model=list[AgentTurnResponse])
def agent_turns(
    session_id: str,
    agents: AgentDirectoryDependency,
) -> list[AgentTurnResponse]:
    try:
        return [
            AgentTurnResponse.from_details(item)
            for item in agents.for_session(session_id).turns()
        ]
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error


@router.post("/resume", response_model=AgentTurnResponse)
async def resume_agent(
    session_id: str,
    _: EmptyRequest,
    agents: AgentDirectoryDependency,
) -> AgentTurnResponse:
    try:
        return AgentTurnResponse.from_details(
            await agents.for_session(session_id).resume()
        )
    except SessionAgentIdleError as error:
        raise ApiError(409, "AGENT_IDLE", str(error)) from error
    except RunLifecycleConflictError as error:
        raise ApiError(409, "AGENT_CONFLICT", str(error)) from error
    except RunQueueFullError as error:
        raise ApiError(429, "AGENT_QUEUE_FULL", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error


@router.post("/cancel", response_model=AgentTurnResponse)
async def cancel_agent(
    session_id: str,
    _: EmptyRequest,
    agents: AgentDirectoryDependency,
) -> AgentTurnResponse:
    try:
        return AgentTurnResponse.from_details(
            await agents.for_session(session_id).cancel()
        )
    except SessionAgentIdleError as error:
        raise ApiError(409, "AGENT_IDLE", str(error)) from error
    except (RunLifecycleConflictError, ConfirmationConflictError) as error:
        raise ApiError(409, "AGENT_CONFLICT", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error
