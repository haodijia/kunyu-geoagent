"""Persistent draft queue controls and temporary interaction holds."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, Field

from kunyu.agent.inbox import InboxMessageNotFoundError, InboxQueueConflictError
from kunyu.agent.queue_interactions import QueueInteractionConflictError
from kunyu.agent.runtime.events import InboxMessagePayload
from kunyu.agent.scheduler import RunSchedulerClosingError
from kunyu.api.agent_dependencies import AgentDirectoryDependency, EmptyRequest
from kunyu.api.errors import ApiError
from kunyu.application.run_lifecycle import RunLifecycleConflictError
from kunyu.application.sessions import SessionNotFoundError
from kunyu.domain.confirmations import ConfirmationConflictError

router = APIRouter()


class QueueInteractionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message_ids: list[str] = Field(min_length=1, max_length=32)


class QueueInteractionResponse(BaseModel):
    lease_milliseconds: int


@router.post(
    "/queue/interactions/{interaction_id}", response_model=QueueInteractionResponse
)
async def acquire_interaction(
    session_id: str,
    interaction_id: UUID,
    body: QueueInteractionRequest,
    agents: AgentDirectoryDependency,
) -> QueueInteractionResponse:
    try:
        duration = await agents.for_session(session_id).hold_queue(
            str(interaction_id), tuple(body.message_ids)
        )
    except (InboxQueueConflictError, QueueInteractionConflictError) as error:
        raise ApiError(409, "QUEUE_CHANGED", str(error)) from error
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error
    return QueueInteractionResponse(lease_milliseconds=duration)


@router.patch(
    "/queue/interactions/{interaction_id}", response_model=QueueInteractionResponse
)
async def renew_interaction(
    session_id: str,
    interaction_id: UUID,
    _: EmptyRequest,
    agents: AgentDirectoryDependency,
) -> QueueInteractionResponse:
    try:
        duration = await agents.for_session(session_id).renew_queue_hold(
            str(interaction_id)
        )
    except QueueInteractionConflictError as error:
        raise ApiError(409, "QUEUE_INTERACTION_EXPIRED", str(error)) from error
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error
    return QueueInteractionResponse(lease_milliseconds=duration)


@router.delete("/queue/interactions/{interaction_id}", status_code=204)
async def release_interaction(
    session_id: str, interaction_id: UUID, agents: AgentDirectoryDependency
) -> Response:
    try:
        await agents.for_session(session_id).release_queue_hold(str(interaction_id))
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    return Response(status_code=204)


@router.post("/inbox/{message_id}/edit", response_model=InboxMessagePayload)
async def edit_queued_input(
    session_id: str, message_id: str, _: EmptyRequest, agents: AgentDirectoryDependency
) -> InboxMessagePayload:
    try:
        return await agents.for_session(session_id).take_queued(message_id)
    except InboxMessageNotFoundError as error:
        raise ApiError(
            409, "INPUT_ALREADY_CLAIMED", "The input is no longer pending."
        ) from error
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error


class QueueUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["auto", "manual"] | None = None
    message_ids: list[str] | None = Field(default=None, max_length=32)


@router.patch("/queue", status_code=204)
async def update_queue(
    session_id: str, body: QueueUpdateRequest, agents: AgentDirectoryDependency
) -> Response:
    if (body.mode is None) == (body.message_ids is None):
        raise ApiError(
            422, "INVALID_INPUT", "Choose either a queue mode or a complete order."
        )
    try:
        agent = agents.for_session(session_id)
        if body.mode is not None:
            await agent.set_queue_mode(body.mode)
        elif body.message_ids is not None:
            await agent.reorder_inputs(tuple(body.message_ids))
    except InboxQueueConflictError as error:
        raise ApiError(409, "QUEUE_CHANGED", str(error)) from error
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error
    return Response(status_code=204)


@router.post("/queue/clear", status_code=204)
async def clear_queue(
    session_id: str, _: EmptyRequest, agents: AgentDirectoryDependency
) -> Response:
    try:
        await agents.for_session(session_id).clear_queue()
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error
    return Response(status_code=204)


@router.post("/inbox/{message_id}/send", status_code=204)
async def send_queued_input(
    session_id: str, message_id: str, _: EmptyRequest, agents: AgentDirectoryDependency
) -> Response:
    try:
        await agents.for_session(session_id).send_queued(message_id)
    except InboxMessageNotFoundError as error:
        raise ApiError(
            409, "INPUT_ALREADY_CLAIMED", "The input is no longer pending."
        ) from error
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except (RunLifecycleConflictError, ConfirmationConflictError) as error:
        raise ApiError(409, "AGENT_CONFLICT", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error
    return Response(status_code=204)


@router.delete("/inbox/{message_id}", status_code=204)
async def discard_input(
    session_id: str,
    message_id: str,
    agents: AgentDirectoryDependency,
) -> Response:
    try:
        agent = agents.for_session(session_id)
        agent.turns()
        await agent.inbox.remove(message_id)
    except InboxMessageNotFoundError as error:
        raise ApiError(
            409, "INPUT_ALREADY_CLAIMED", "The input is no longer pending."
        ) from error
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    return Response(status_code=204)
