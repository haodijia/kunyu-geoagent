"""Read and control one-shot children through their durable parent address."""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from kunyu.agent import services as s
from kunyu.agent.runtime.events import ModelSnapshotPayload
from kunyu.agent.runtime.subagents import ReducedSubagent
from kunyu.agent.runtime.tools import ToolExecutionError
from kunyu.agent.subagents import SubagentManager
from kunyu.api.agent_dependencies import AgentDirectoryDependency, EmptyRequest
from kunyu.api.errors import ApiError
from kunyu.application.sessions import SessionNotFoundError

router = APIRouter(prefix="/api/v1/sessions/{session_id}/subagents", tags=["subagents"])


def manager(request: Request) -> SubagentManager:
    if request.app.state.closing_event.is_set():
        raise ApiError(503, "SHUTTING_DOWN", "The backend is shutting down.")
    return request.app.state.agent_kernel.context.require(s.SUBAGENTS)


Manager = Annotated[SubagentManager, Depends(manager)]


class SubagentResponse(BaseModel):
    child_id: str
    parent_run_id: str
    tool_call_id: str
    description: str
    prompt: str
    permission: Literal["read-only"]
    model_snapshot: ModelSnapshotPayload
    status: Literal[
        "queued",
        "ready",
        "model_running",
        "tool_running",
        "waiting_input",
        "waiting_confirmation",
        "interrupted",
        "completed",
        "failed",
        "cancelled",
    ]
    output: str | None
    reason: str | None
    active_tool: str | None
    step: int | None
    created_at: datetime
    settled_at: datetime | None
    created_sequence: int
    settled_sequence: int | None


def response(child: ReducedSubagent, manager: SubagentManager) -> SubagentResponse:
    state = manager.repository.child_state(child.created.child_session_id)
    run = next(
        (run for run in state.runs if run.run_id == child.created.child_run_id), None
    )
    active_tool = (
        None
        if run is None
        else next(
            (
                call.name
                for call in reversed(run.tool_calls)
                if call.status == "running"
            ),
            None,
        )
    )
    return SubagentResponse(
        child_id=child.created.child_session_id,
        parent_run_id=child.created.owner_run_id,
        tool_call_id=child.created.tool_call_id,
        description=child.created.description,
        prompt=child.created.prompt,
        permission=child.created.permission,
        model_snapshot=child.created.model_snapshot,
        status=child.settled.status
        if child.settled is not None
        else "queued"
        if run is None
        else run.state.value,
        output=None if child.settled is None else child.settled.output,
        reason=None if child.settled is None else child.settled.reason,
        active_tool=active_tool,
        step=None if run is None else run.step,
        created_at=child.created_at,
        settled_at=child.settled_at,
        created_sequence=child.created_sequence,
        settled_sequence=child.settled_sequence,
    )


def require_parent(session_id: str, agents: AgentDirectoryDependency) -> None:
    try:
        agents.for_session(session_id).turns()
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", "Parent session not found.") from error


@router.get("", response_model=list[SubagentResponse])
def list_children(session_id: str, agents: AgentDirectoryDependency, manager: Manager):
    require_parent(session_id, agents)
    return [
        response(child, manager) for _, child in manager.repository.list(session_id)
    ]


@router.get("/{child_id}", response_model=SubagentResponse)
def get_child(
    session_id: str, child_id: str, agents: AgentDirectoryDependency, manager: Manager
):
    require_parent(session_id, agents)
    try:
        return response(manager.require(child_id, session_id), manager)
    except ToolExecutionError as error:
        raise ApiError(
            404, "NOT_FOUND", "Child not found under this parent."
        ) from error


@router.post("/{child_id}/cancel", response_model=SubagentResponse)
async def cancel_child(
    session_id: str,
    child_id: str,
    _: EmptyRequest,
    agents: AgentDirectoryDependency,
    manager: Manager,
):
    require_parent(session_id, agents)
    try:
        return response(await manager.cancel(child_id, session_id), manager)
    except ToolExecutionError as error:
        raise ApiError(
            404, "NOT_FOUND", "Child not found under this parent."
        ) from error
