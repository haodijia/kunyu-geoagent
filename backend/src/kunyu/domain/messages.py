from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

from kunyu.domain.events import AgentEvent

MessageRole = Literal["user", "assistant"]
MessageStatus = Literal[
    "streaming",
    "completed",
    "interrupted",
    "failed",
    "cancelled",
]


@dataclass(frozen=True, slots=True)
class Message:
    id: str
    session_id: str
    sequence: int
    role: MessageRole
    content: str
    run_id: str | None
    step: int | None
    attempt: int | None
    status: MessageStatus
    content_length: int
    updated_sequence: int
    created_at: datetime
    updated_at: datetime


class MessageRepository(Protocol):
    def append(
        self,
        message_id: str,
        session_id: str,
        role: Literal["user"],
        content: str,
        occurred_at: datetime,
    ) -> tuple[Message, AgentEvent] | None: ...

    def list_for_session(self, session_id: str) -> list[Message] | None: ...

    def latest_event_sequence(self, session_id: str) -> int | None: ...

    def list_events_after(
        self, session_id: str, sequence: int
    ) -> list[AgentEvent]: ...
