"""Derive all Agent query state from one contiguous session event log."""

from collections import defaultdict
from collections.abc import Iterable

from dsh.events import (
    AgentEvent,
    SessionCreatedEvent,
    UserMessageAppendedEvent,
    validate_event_draft,
)
from dsh.reducer import reduce_run
from dsh.run_state import RunReductionError
from dsh.session_state import (
    ReducedSession,
    ReducedUserMessage,
    SessionReductionError,
)


def reduce_session(events: Iterable[AgentEvent]) -> ReducedSession:
    """Fold one complete, one-based contiguous session log."""
    session_id: str | None = None
    session_created = False
    expected_sequence = 1
    user_messages: dict[str, ReducedUserMessage] = {}
    run_events: dict[str, list[AgentEvent]] = defaultdict(list)

    for envelope in events:
        if envelope.sequence != expected_sequence:
            raise SessionReductionError(
                f"Session event sequence must be contiguous: expected "
                f"{expected_sequence}, got {envelope.sequence}."
            )
        expected_sequence += 1
        if session_id is None:
            session_id = envelope.session_id
        elif envelope.session_id != session_id:
            raise SessionReductionError("Session replay cannot mix sessions.")

        try:
            event = validate_event_draft(
                {
                    "session_id": envelope.session_id,
                    "run_id": envelope.run_id,
                    "event_type": envelope.event_type,
                    "payload": envelope.payload,
                    "occurred_at": envelope.occurred_at,
                }
            )
        except ValueError as error:
            raise SessionReductionError(
                f"Event {envelope.sequence} is invalid: {error}"
            ) from error

        if isinstance(event, SessionCreatedEvent):
            if session_created or event.run_id is not None or envelope.sequence != 1:
                raise SessionReductionError(
                    "A session log must begin with one run-independent creation event."
                )
            session_created = True
            continue

        if not session_created:
            raise SessionReductionError(
                "Session events cannot precede session.created."
            )

        if isinstance(event, UserMessageAppendedEvent):
            message_id = event.payload.message_id
            if message_id in user_messages:
                raise SessionReductionError(
                    f"User message '{message_id}' was appended more than once."
                )
            user_messages[message_id] = ReducedUserMessage(
                message_id=message_id,
                session_id=event.session_id,
                run_id=event.run_id,
                content=event.payload.content,
                created_at=event.occurred_at,
                created_sequence=envelope.sequence,
            )

        if envelope.run_id is not None:
            run_events[envelope.run_id].append(envelope)

    if session_id is None:
        raise SessionReductionError("A session log cannot be empty.")
    if not session_created:
        raise SessionReductionError("Session replay is missing session.created.")

    runs = []
    for run_id, grouped_events in run_events.items():
        try:
            run = reduce_run(grouped_events)
        except RunReductionError as error:
            raise SessionReductionError(
                f"Run '{run_id}' cannot be reduced: {error}"
            ) from error
        user_message = user_messages.get(run.user_message_id)
        if user_message is None or user_message.run_id != run_id:
            raise SessionReductionError(
                f"Run '{run_id}' does not own its user message event."
            )
        runs.append(run)

    reduced_run_ids = {run.run_id for run in runs}
    for message in user_messages.values():
        if message.run_id is not None and message.run_id not in reduced_run_ids:
            raise SessionReductionError(
                f"User message '{message.message_id}' references an incomplete run log."
            )

    message_ids = set(user_messages)
    tool_call_ids: set[str] = set()
    for run in runs:
        for assistant in run.assistants:
            if assistant.message_id in message_ids:
                raise SessionReductionError(
                    f"Message identifier '{assistant.message_id}' is not unique."
                )
            message_ids.add(assistant.message_id)
        for tool in run.tool_calls:
            if tool.tool_call_id in tool_call_ids:
                raise SessionReductionError(
                    f"Tool call identifier '{tool.tool_call_id}' is not unique."
                )
            tool_call_ids.add(tool.tool_call_id)

    return ReducedSession(
        session_id=session_id,
        user_messages=tuple(
            sorted(user_messages.values(), key=lambda item: item.created_sequence)
        ),
        runs=tuple(sorted(runs, key=lambda item: item.created_sequence)),
    )
