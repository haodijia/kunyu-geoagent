from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

from kunyu.domain.events import AgentEvent

MessageRole = Literal["user"]


@dataclass(frozen=True, slots=True)
class Message:
    id: str
    session_id: str
    sequence: int
    role: MessageRole
    content: str
    created_at: datetime


class MessageRepository(Protocol):
    def append(
        self,
        message_id: str,
        event_id: str,
        session_id: str,
        role: MessageRole,
        content: str,
        occurred_at: datetime,
    ) -> tuple[Message, AgentEvent] | None: ...

    def list_for_session(self, session_id: str) -> list[Message] | None: ...

    def latest_event_sequence(self, session_id: str) -> int | None: ...

    def list_events_after(
        self, session_id: str, sequence: int
    ) -> list[AgentEvent]: ...
