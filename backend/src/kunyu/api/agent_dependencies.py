"""Shared session Agent dependencies and empty control request."""

from typing import Annotated

from fastapi import Depends, Request
from pydantic import BaseModel, ConfigDict

from kunyu.agent.scheduler import RunScheduler
from kunyu.agent.session_agent import AgentDirectory


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


def get_run_scheduler(request: Request) -> RunScheduler:
    return request.app.state.run_scheduler


RunSchedulerDependency = Annotated[RunScheduler, Depends(get_run_scheduler)]


def get_agent_directory(request: Request) -> AgentDirectory:
    return request.app.state.agent_directory


AgentDirectoryDependency = Annotated[AgentDirectory, Depends(get_agent_directory)]
