import asyncio
import json
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field, JsonValue
from starlette.responses import StreamingResponse

from kunyu.agent.scheduler import (
    RunQueueFullError,
    RunSchedulerClosingError,
)
from kunyu.api.agent import AgentDirectoryDependency
from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.api.run_models import AgentTurnResponse
from kunyu.application.messages import (
    InvalidEventSequenceError,
    MessageService,
)
from kunyu.application.sessions import SessionNotFoundError
from kunyu.domain.events import AgentEvent
from kunyu.domain.messages import Message
from kunyu.domain.run_acceptance import (
    CredentialUnavailableError,
    IdempotencyConflictError,
    InvalidMapContextError,
    ModelSelection,
    ModelUnverifiedError,
    RunAcceptanceConflictError,
    RunAcceptanceNotFoundError,
    RunAcceptanceRequest,
    SessionArchivedAcceptanceError,
    UnsupportedModelCapabilityError,
    WorkspaceRemovedAcceptanceError,
)
from kunyu.domain.runs import ProjectionNotFoundError
from kunyu.persistence.database import Database
from kunyu.persistence.messages import SQLAlchemyMessageRepository

router = APIRouter(prefix="/api/v1/sessions/{session_id}", tags=["messages"])
EVENT_POLL_INTERVAL_SECONDS = 0.25


class AppendMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=32_768)
    delivery: Literal["followup", "steer"]
    model_selection: "ModelSelectionRequest"
    map_context: "MapContextRequest"


class InjectContextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=32_768)


class ModelSelectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    connection_id: str = Field(min_length=1, max_length=64)
    model_id: str = Field(min_length=1, max_length=256)
    reasoning_effort: str | None = Field(default=None, min_length=1, max_length=64)


class MapViewportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    zoom: float = Field(ge=0, le=24, allow_inf_nan=False)


class MapContextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: str = Field(min_length=1, max_length=64)
    viewport: MapViewportRequest
    event_id: None = None
    selected_aoi_id: None = None
    selected_feature: None = None
    visible_layer_ids: list[JsonValue] = Field(default_factory=list, max_length=0)
    active_result_layer_id: None = None
    active_observation_id: None = None
    comparison_observation_ids: list[JsonValue] = Field(
        default_factory=list, max_length=0
    )


class AcceptedMessageResponse(BaseModel):
    message: "MessageResponse"
    turn: AgentTurnResponse


class MessageResponse(BaseModel):
    id: str
    session_id: str
    sequence: int
    role: Literal["user", "assistant"]
    content: str
    run_id: str | None
    step: int | None
    attempt: int | None
    status: Literal["streaming", "completed", "interrupted", "failed", "cancelled"]
    content_length: int
    updated_sequence: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, message: Message) -> "MessageResponse":
        return cls(
            id=message.id,
            session_id=message.session_id,
            sequence=message.sequence,
            role=message.role,
            content=message.content,
            run_id=message.run_id,
            step=message.step,
            attempt=message.attempt,
            status=message.status,
            content_length=message.content_length,
            updated_sequence=message.updated_sequence,
            created_at=message.created_at,
            updated_at=message.updated_at,
        )


class EventResponse(BaseModel):
    id: str
    session_id: str
    sequence: int
    event_type: str
    payload: dict[str, Any]
    occurred_at: datetime
    run_id: str | None

    @classmethod
    def from_domain(cls, event: AgentEvent) -> "EventResponse":
        return cls(
            id=event.id,
            session_id=event.session_id,
            sequence=event.sequence,
            event_type=event.event_type,
            payload=dict(event.payload),
            occurred_at=event.occurred_at,
            run_id=event.run_id,
        )


class EventHistoryResponse(BaseModel):
    items: list[EventResponse]
    next_after_sequence: int
    has_more: bool


@router.post("/context", response_model=EventResponse, status_code=201)
def inject_context(
    session_id: str,
    body: InjectContextRequest,
    agents: AgentDirectoryDependency,
) -> EventResponse:
    content = body.content.strip()
    if not content:
        raise ApiError(422, "INVALID_INPUT", "Injected context must not be blank.")
    try:
        event = agents.for_session(session_id).inject(content)
    except ProjectionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    return EventResponse.from_domain(event)


def get_message_service(
    database: Annotated[Database, Depends(get_database)],
) -> MessageService:
    return MessageService(SQLAlchemyMessageRepository(database))


MessageServiceDependency = Annotated[MessageService, Depends(get_message_service)]


@router.post(
    "/messages",
    response_model=AcceptedMessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def append_message(
    session_id: str,
    body: AppendMessageRequest,
    agents: AgentDirectoryDependency,
    idempotency_key: Annotated[UUID, Header(alias="Idempotency-Key")],
) -> AcceptedMessageResponse:
    if not body.content.strip():
        raise ApiError(422, "INVALID_INPUT", "Message content must not be blank.")
    normalized_body = json.dumps(
        body.model_dump(mode="json"),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    request = RunAcceptanceRequest(
        session_id=session_id,
        idempotency_key=str(idempotency_key),
        normalized_body=normalized_body,
        content=body.content,
        model_selection=ModelSelection(
            connection_id=body.model_selection.connection_id,
            model_id=body.model_selection.model_id,
            reasoning_effort=body.model_selection.reasoning_effort,
        ),
        map_context=body.map_context.model_dump(mode="json"),
    )
    try:
        agent = agents.for_session(session_id)
        result = (
            await agent.steer(request)
            if body.delivery == "steer"
            else await agent.followup(request)
        )
    except RunAcceptanceNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except IdempotencyConflictError as error:
        raise ApiError(409, "IDEMPOTENCY_CONFLICT", str(error)) from error
    except SessionArchivedAcceptanceError as error:
        raise ApiError(409, "SESSION_ARCHIVED", str(error)) from error
    except WorkspaceRemovedAcceptanceError as error:
        raise ApiError(409, "WORKSPACE_REMOVED", str(error)) from error
    except RunAcceptanceConflictError as error:
        raise ApiError(409, "RUN_CONFLICT", str(error)) from error
    except (InvalidMapContextError, ModelUnverifiedError) as error:
        code = (
            "MODEL_UNVERIFIED"
            if isinstance(error, ModelUnverifiedError)
            else "INVALID_INPUT"
        )
        raise ApiError(422, code, str(error)) from error
    except UnsupportedModelCapabilityError as error:
        raise ApiError(422, "UNSUPPORTED_CAPABILITY", str(error)) from error
    except CredentialUnavailableError as error:
        raise ApiError(503, "CREDENTIAL_STORE_UNAVAILABLE", str(error)) from error
    except RunQueueFullError as error:
        raise ApiError(429, "RUN_QUEUE_FULL", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error
    return AcceptedMessageResponse(
        message=MessageResponse.from_domain(result.message),
        turn=AgentTurnResponse.from_details(result.run),
    )


@router.get("/messages", response_model=list[MessageResponse])
def list_messages(
    session_id: str,
    service: MessageServiceDependency,
) -> list[MessageResponse]:
    try:
        messages = service.list_for_session(session_id)
    except SessionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error
    return [MessageResponse.from_domain(item) for item in messages]


@router.get("/events/history", response_model=EventHistoryResponse)
def event_history(
    session_id: str,
    service: MessageServiceDependency,
    after_sequence: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> EventHistoryResponse:
    try:
        service.validate_event_cursor(session_id, after_sequence)
    except SessionNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except InvalidEventSequenceError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    events = service.list_events_after(session_id, after_sequence, limit + 1)
    page = events[:limit]
    return EventHistoryResponse(
        items=[EventResponse.from_domain(event) for event in page],
        next_after_sequence=page[-1].sequence if page else after_sequence,
        has_more=len(events) > limit,
    )


@router.get("/events/stream", response_class=StreamingResponse)
def stream_events(
    session_id: str,
    request: Request,
    service: MessageServiceDependency,
    after_sequence: Annotated[int, Query(ge=0)] = 0,
) -> StreamingResponse:
    try:
        service.validate_event_cursor(session_id, after_sequence)
    except SessionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error
    except InvalidEventSequenceError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error

    return StreamingResponse(
        _event_stream(request, service, session_id, after_sequence),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


async def _event_stream(
    request: Request,
    service: MessageService,
    session_id: str,
    after_sequence: int,
) -> AsyncIterator[str]:
    current_sequence = after_sequence
    closing_event: asyncio.Event = request.app.state.closing_event
    while not closing_event.is_set() and not await request.is_disconnected():
        events = service.list_events_after(session_id, current_sequence)
        for event in events:
            yield _format_event(event)
            current_sequence = event.sequence
        try:
            await asyncio.wait_for(
                closing_event.wait(),
                timeout=EVENT_POLL_INTERVAL_SECONDS,
            )
        except TimeoutError:
            pass


def _format_event(event: AgentEvent) -> str:
    data = EventResponse.from_domain(event).model_dump_json()
    return f"id: {event.sequence}\nevent: {event.event_type}\ndata: {data}\n\n"
