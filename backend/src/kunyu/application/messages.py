from collections.abc import Callable
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from kunyu.application.sessions import SessionNotFoundError
from kunyu.domain.events import AgentEvent
from kunyu.domain.messages import Message, MessageRepository


class EmptyMessageError(ValueError):
    pass


class InvalidEventSequenceError(ValueError):
    def __init__(self, sequence: int, latest_sequence: int) -> None:
        self.sequence = sequence
        self.latest_sequence = latest_sequence
        super().__init__(
            f"Event sequence {sequence} is ahead of latest sequence "
            f"{latest_sequence}."
        )


class MessageService:
    def __init__(
        self,
        repository: MessageRepository,
        *,
        message_id_factory: Callable[[], str] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._message_id_factory = message_id_factory or _new_message_id
        self._clock = clock or _utc_now

    def append_user_message(
        self,
        session_id: str,
        role: Literal["user"],
        content: str,
    ) -> Message:
        if not content.strip():
            raise EmptyMessageError("Message content must not be empty.")

        result = self._repository.append(
            message_id=self._message_id_factory(),
            session_id=session_id,
            role=role,
            content=content,
            occurred_at=self._clock(),
        )
        if result is None:
            raise SessionNotFoundError(session_id)
        message, _ = result
        return message

    def list_for_session(self, session_id: str) -> list[Message]:
        messages = self._repository.list_for_session(session_id)
        if messages is None:
            raise SessionNotFoundError(session_id)
        return messages

    def validate_event_cursor(self, session_id: str, sequence: int) -> None:
        latest_sequence = self._repository.latest_event_sequence(session_id)
        if latest_sequence is None:
            raise SessionNotFoundError(session_id)
        if sequence > latest_sequence:
            raise InvalidEventSequenceError(sequence, latest_sequence)

    def list_events_after(
        self, session_id: str, sequence: int
    ) -> list[AgentEvent]:
        return self._repository.list_events_after(session_id, sequence)


def _new_message_id() -> str:
    return f"msg_{uuid4().hex}"


def _utc_now() -> datetime:
    return datetime.now(UTC)
