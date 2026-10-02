"""Derive all Agent query state from one contiguous session event log."""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import replace

from kunyu.agent.runtime.events import (
    TERMINAL_RUN_STATES,
    AgentEvent,
    InboxMessagePayload,
    InboxSplicedEvent,
    SessionCreatedEvent,
    StepDecisionEvent,
    UserMessageAppendedEvent,
    validate_event_draft,
)
from kunyu.agent.runtime.reducer import reduce_run
from kunyu.agent.runtime.run_state import RunReductionError
from kunyu.agent.runtime.runner_types import model_step_position
from kunyu.agent.runtime.session_state import (
    ReducedSession,
    ReducedUserMessage,
    SessionReductionError,
)


def reduce_session(events: Iterable[AgentEvent]) -> ReducedSession:
    """Fold one complete, one-based contiguous session log."""
    session_id: str | None = None
    workspace_id: str | None = None
    session_created = False
    expected_sequence = 1
    user_messages: dict[str, ReducedUserMessage] = {}
    next_step: list[str] = []
    next_turn: list[InboxMessagePayload] = []
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
            workspace_id = event.payload.workspace_id
            continue

        if not session_created:
            raise SessionReductionError(
                "Session events cannot precede session.created."
            )

        if isinstance(event, UserMessageAppendedEvent):
            message_id = event.payload.message_id
            previous = user_messages.get(message_id)
            if previous is not None and not (
                previous.applied_step == 0
                and previous.run_id == event.run_id
                and previous.content == event.payload.content
                and not previous.discarded
            ):
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
                updated_sequence=envelope.sequence,
            )

        if isinstance(event, InboxSplicedEvent) and event.payload.target == "next-turn":
            _splice_next_turn(
                event, envelope.sequence, next_turn, user_messages, run_events
            )

        if isinstance(event, InboxSplicedEvent) and event.payload.target == "next-step":
            payload = event.payload
            if any(item.turn is not None for item in payload.messages):
                raise SessionReductionError(
                    "Steering input cannot create future turns."
                )
            if payload.target_run_id not in run_events:
                raise SessionReductionError(
                    "Inbox input must belong to an existing run."
                )
            target = reduce_run(run_events[payload.target_run_id])
            if payload.messages and target.state in TERMINAL_RUN_STATES:
                raise SessionReductionError("Finished runs cannot accept inbox input.")
            if payload.disposition == "claim" and (
                payload.step != model_step_position(target)[0]
            ):
                raise SessionReductionError(
                    "Inbox claims must match the entering model step."
                )
            stop = payload.start + payload.delete_count
            if payload.start > len(next_step) or stop > len(next_step):
                raise SessionReductionError(
                    "Inbox splice exceeds the pending input list."
                )
            removed = next_step[payload.start : stop]
            if payload.delete_count:
                if (
                    payload.messages
                    or payload.disposition is None
                    or ((payload.disposition == "claim") != (payload.step is not None))
                ):
                    raise SessionReductionError(
                        "Inbox deletion must explicitly claim or discard input."
                    )
                for message_id in removed:
                    message = user_messages[message_id]
                    if message.run_id != payload.target_run_id:
                        raise SessionReductionError(
                            "Inbox splice crosses run ownership."
                        )
                    user_messages[message_id] = replace(
                        message,
                        applied_step=payload.step,
                        discarded=payload.disposition == "discard",
                        updated_sequence=envelope.sequence,
                    )
            elif (
                not payload.messages
                or payload.disposition is not None
                or payload.step is not None
            ):
                raise SessionReductionError(
                    "Inbox insertion must contain unclaimed input."
                )
            inserted = []
            for message in payload.messages:
                if message.message_id in user_messages:
                    raise SessionReductionError(
                        "Inbox message identities must be unique."
                    )
                user_messages[message.message_id] = ReducedUserMessage(
                    message_id=message.message_id,
                    session_id=event.session_id,
                    run_id=payload.target_run_id,
                    content=message.content,
                    created_at=event.occurred_at,
                    created_sequence=envelope.sequence,
                    updated_sequence=envelope.sequence,
                    delivery="steer",
                    map_context=message.map_context,
                )
                inserted.append(message.message_id)
            next_step[payload.start : stop] = inserted

        if isinstance(event, StepDecisionEvent):
            target = reduce_run(run_events[envelope.run_id])
            prior_ids = {
                message_id
                for decision in target.decisions
                for message_id in decision.payload.input_ids
            }
            expected = {
                message.message_id
                for message in user_messages.values()
                if message.run_id == envelope.run_id
                and not message.discarded
                and message.message_id not in prior_ids
                and (
                    message.message_id == target.user_message_id
                    or message.applied_step == event.payload.step
                )
            }
            if set(event.payload.input_ids) != expected:
                raise SessionReductionError(
                    "Step admission must account for all claimed input."
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
    confirmation_ids: set[str] = set()
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
        for confirmation in run.confirmations:
            if confirmation.workspace_id != workspace_id:
                raise SessionReductionError(
                    f"Confirmation '{confirmation.confirmation_id}' crosses workspace scope."
                )
            if confirmation.confirmation_id in confirmation_ids:
                raise SessionReductionError(
                    f"Confirmation identifier '{confirmation.confirmation_id}' is not unique."
                )
            confirmation_ids.add(confirmation.confirmation_id)

    return ReducedSession(
        session_id=session_id,
        user_messages=tuple(
            sorted(user_messages.values(), key=lambda item: item.created_sequence)
        ),
        runs=tuple(sorted(runs, key=lambda item: item.created_sequence)),
        next_step=tuple(next_step),
        next_turn=tuple(next_turn),
    )


def _splice_next_turn(
    event: InboxSplicedEvent,
    sequence: int,
    pending: list[InboxMessagePayload],
    messages: dict[str, ReducedUserMessage],
    runs: dict[str, list[AgentEvent]],
) -> None:
    payload = event.payload
    stop = payload.start + payload.delete_count
    if payload.start > len(pending) or stop > len(pending) or payload.step is not None:
        raise SessionReductionError("Invalid next-turn splice boundary.")
    removed = pending[payload.start : stop]
    if removed:
        if payload.messages or payload.disposition is None:
            raise SessionReductionError("Queued input removal requires a disposition.")
        for item in removed:
            if item.turn is None or item.turn.run_id != payload.target_run_id:
                raise SessionReductionError(
                    "Queued input removal crosses turn identity."
                )
            if payload.disposition == "claim" and (
                payload.start != 0
                or len(removed) != 1
                or any(
                    reduce_run(events).state not in TERMINAL_RUN_STATES
                    for events in runs.values()
                )
            ):
                raise SessionReductionError(
                    "Only an idle session can claim its first queued input."
                )
            messages[item.message_id] = replace(
                messages[item.message_id],
                run_id=payload.target_run_id
                if payload.disposition == "claim"
                else None,
                applied_step=0 if payload.disposition == "claim" else None,
                discarded=payload.disposition == "discard",
                updated_sequence=sequence,
            )
    elif len(payload.messages) != 1 or payload.disposition is not None:
        raise SessionReductionError(
            "Queued input insertion must contain one unclaimed message."
        )
    for item in payload.messages:
        if (
            item.turn is None
            or item.turn.run_id != payload.target_run_id
            or item.turn.run_id in runs
            or item.message_id in messages
            or any(
                existing.turn.run_id == item.turn.run_id
                for existing in pending
                if existing.turn is not None
            )
        ):
            raise SessionReductionError(
                "Queued input requires unique message and future turn identities."
            )
        messages[item.message_id] = ReducedUserMessage(
            message_id=item.message_id,
            session_id=event.session_id,
            run_id=None,
            content=item.content,
            created_at=event.occurred_at,
            created_sequence=sequence,
            updated_sequence=sequence,
        )
    pending[payload.start : stop] = payload.messages
