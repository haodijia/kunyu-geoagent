"""Shared session Agent dependencies and empty control request."""

from typing import Annotated

from fastapi import Depends, Request
from pydantic import BaseModel, ConfigDict

from kunyu.agent.core import services as s
from kunyu.agent.orchestration.scheduler import RunScheduler
from kunyu.agent.orchestration.session_agent import AgentDirectory
from kunyu.api.errors import ApiError


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


def require_parent_controls(session_id: str, request: Request) -> None:
    if request.method not in {
        "GET",
        "HEAD",
    } and request.app.state.agent_kernel.context.require(
        s.SUBAGENTS
    ).repository.is_child(session_id):
        raise ApiError(
            409,
            "CHILD_READ_ONLY",
            "Use the parent delegation to control this one-shot child.",
        )


def get_run_scheduler(request: Request) -> RunScheduler:
    return request.app.state.run_scheduler


RunSchedulerDependency = Annotated[RunScheduler, Depends(get_run_scheduler)]


def get_agent_directory(request: Request) -> AgentDirectory:
    return request.app.state.agent_directory


AgentDirectoryDependency = Annotated[AgentDirectory, Depends(get_agent_directory)]
