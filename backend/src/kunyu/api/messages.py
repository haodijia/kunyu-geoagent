import asyncio
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from starlette.responses import StreamingResponse

from kunyu.api.dependencies import get_database
from kunyu.application.messages import (
    EmptyMessageError,
    InvalidEventSequenceError,
    MessageService,
)
from kunyu.application.sessions import SessionNotFoundError
from kunyu.domain.events import AgentEvent
from kunyu.domain.messages import Message
from kunyu.persistence.database import Database
from kunyu.persistence.messages import SQLAlchemyMessageRepository

router = APIRouter(prefix="/api/v1/sessions/{session_id}", tags=["messages"])
EVENT_POLL_INTERVAL_SECONDS = 0.25


class AppendMessageRequest(BaseModel):
    role: Literal["user"]
    content: str = Field(min_length=1)


class MessageResponse(BaseModel):
    id: str
    session_id: str
    sequence: int
    role: Literal["user"]
    content: str
    created_at: datetime

    @classmethod
    def from_domain(cls, message: Message) -> "MessageResponse":
        return cls(
            id=message.id,
            session_id=message.session_id,
            sequence=message.sequence,
            role=message.role,
            content=message.content,
            created_at=message.created_at,
        )


class EventResponse(BaseModel):
    id: str
    session_id: str
    sequence: int
    event_type: str
    payload: dict[str, Any]
    occurred_at: datetime

    @classmethod
    def from_domain(cls, event: AgentEvent) -> "EventResponse":
        return cls(
            id=event.id,
            session_id=event.session_id,
            sequence=event.sequence,
            event_type=event.event_type,
            payload=event.payload,
            occurred_at=event.occurred_at,
        )


def get_message_service(
    database: Annotated[Database, Depends(get_database)],
) -> MessageService:
    return MessageService(SQLAlchemyMessageRepository(database))


MessageServiceDependency = Annotated[MessageService, Depends(get_message_service)]


@router.post(
    "/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def append_message(
    session_id: str,
    request: AppendMessageRequest,
    service: MessageServiceDependency,
) -> MessageResponse:
    try:
        message = service.append_user_message(
            session_id, request.role, request.content
        )
    except EmptyMessageError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
    except SessionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error
    return MessageResponse.from_domain(message)


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


@router.get("/events", response_class=StreamingResponse)
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
    while not await request.is_disconnected():
        events = service.list_events_after(session_id, current_sequence)
        for event in events:
            yield _format_event(event)
            current_sequence = event.sequence
        await asyncio.sleep(EVENT_POLL_INTERVAL_SECONDS)


def _format_event(event: AgentEvent) -> str:
    data = EventResponse.from_domain(event).model_dump_json()
    return f"id: {event.sequence}\nevent: {event.event_type}\ndata: {data}\n\n"
