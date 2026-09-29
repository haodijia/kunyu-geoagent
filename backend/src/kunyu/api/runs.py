from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict

from kunyu.agent.scheduler import (
    RunQueueFullError,
    RunScheduler,
    RunSchedulerClosingError,
)
from kunyu.api.errors import ApiError
from kunyu.api.run_models import RunResponse
from kunyu.application.run_lifecycle import (
    RunLifecycleConflictError,
    RunLifecycleNotFoundError,
)
from kunyu.domain.confirmations import ConfirmationConflictError

router = APIRouter(prefix="/api/v1/runs", tags=["runs"])


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


def get_run_scheduler(request: Request) -> RunScheduler:
    return request.app.state.run_scheduler


RunSchedulerDependency = Annotated[RunScheduler, Depends(get_run_scheduler)]


@router.post("/{run_id}/resume", response_model=RunResponse)
async def resume_run(
    run_id: str,
    _: EmptyRequest,
    scheduler: RunSchedulerDependency,
) -> RunResponse:
    try:
        return RunResponse.from_details(await scheduler.resume(run_id))
    except RunLifecycleNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except RunLifecycleConflictError as error:
        raise ApiError(409, "RUN_CONFLICT", str(error)) from error
    except RunQueueFullError as error:
        raise ApiError(429, "RUN_QUEUE_FULL", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error


@router.post("/{run_id}/cancel", response_model=RunResponse)
async def cancel_run(
    run_id: str,
    _: EmptyRequest,
    scheduler: RunSchedulerDependency,
) -> RunResponse:
    try:
        return RunResponse.from_details(await scheduler.cancel(run_id))
    except RunLifecycleNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except (RunLifecycleConflictError, ConfirmationConflictError) as error:
        raise ApiError(409, "RUN_CONFLICT", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error
