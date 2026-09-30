from kunyu.application.sessions import SessionNotFoundError
from kunyu.domain.events import AgentEvent
from kunyu.domain.messages import Message, MessageRepository


class InvalidEventSequenceError(ValueError):
    def __init__(self, sequence: int, latest_sequence: int) -> None:
        self.sequence = sequence
        self.latest_sequence = latest_sequence
        super().__init__(
            f"Event sequence {sequence} is ahead of latest sequence {latest_sequence}."
        )


class MessageService:
    def __init__(self, repository: MessageRepository) -> None:
        self._repository = repository

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
        self,
        session_id: str,
        sequence: int,
        limit: int | None = None,
    ) -> list[AgentEvent]:
        return self._repository.list_events_after(session_id, sequence, limit)
