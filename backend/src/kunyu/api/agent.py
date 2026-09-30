"""Session-scoped Agent state and lifecycle API."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict

from kunyu.agent.scheduler import (
    RunQueueFullError,
    RunScheduler,
    RunSchedulerClosingError,
)
from kunyu.api.dependencies import get_run_lifecycle_service
from kunyu.api.errors import ApiError
from kunyu.api.run_models import RunResponse
from kunyu.application.run_lifecycle import (
    RunLifecycleConflictError,
    RunLifecycleService,
)
from kunyu.application.sessions import SessionNotFoundError
from kunyu.domain.confirmations import ConfirmationConflictError
from kunyu.domain.runs import RunDetails

router = APIRouter(prefix="/api/v1/sessions/{session_id}/agent", tags=["agent"])


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


def get_run_scheduler(request: Request) -> RunScheduler:
    return request.app.state.run_scheduler


RunSchedulerDependency = Annotated[RunScheduler, Depends(get_run_scheduler)]
RunLifecycleDependency = Annotated[
    RunLifecycleService, Depends(get_run_lifecycle_service)
]


@router.get("", response_model=list[RunResponse])
def agent_turns(
    session_id: str,
    lifecycle: RunLifecycleDependency,
) -> list[RunResponse]:
    try:
        return [
            RunResponse.from_details(item)
            for item in lifecycle.list_for_session(session_id)
        ]
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error


@router.post("/resume", response_model=RunResponse)
async def resume_agent(
    session_id: str,
    _: EmptyRequest,
    scheduler: RunSchedulerDependency,
    lifecycle: RunLifecycleDependency,
) -> RunResponse:
    turn = _active_turn(session_id, lifecycle)
    try:
        return RunResponse.from_details(await scheduler.resume(turn.run.id))
    except RunLifecycleConflictError as error:
        raise ApiError(409, "AGENT_CONFLICT", str(error)) from error
    except RunQueueFullError as error:
        raise ApiError(429, "AGENT_QUEUE_FULL", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error


@router.post("/cancel", response_model=RunResponse)
async def cancel_agent(
    session_id: str,
    _: EmptyRequest,
    scheduler: RunSchedulerDependency,
    lifecycle: RunLifecycleDependency,
) -> RunResponse:
    turn = _active_turn(session_id, lifecycle)
    try:
        return RunResponse.from_details(await scheduler.cancel(turn.run.id))
    except (RunLifecycleConflictError, ConfirmationConflictError) as error:
        raise ApiError(409, "AGENT_CONFLICT", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error


def _active_turn(
    session_id: str,
    lifecycle: RunLifecycleService,
) -> RunDetails:
    try:
        turns = lifecycle.list_for_session(session_id)
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    active = next(
        (
            turn
            for turn in reversed(turns)
            if turn.run.state.value not in {"completed", "failed", "cancelled"}
        ),
        None,
    )
    if active is None:
        raise ApiError(409, "AGENT_IDLE", "The session Agent has no active turn.")
    return active
