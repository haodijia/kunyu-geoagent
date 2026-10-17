"""Run projection replay; derived exclusively from committed events."""

from collections.abc import Iterable

from kunyu.agent.runtime.events.base import TERMINAL_RUN_STATES, RunState
from kunyu.agent.runtime.events.run import RunCreatedEvent
from kunyu.agent.runtime.events.session import UserMessageAppendedEvent
from kunyu.agent.runtime.events.store import (
    AgentEvent,
    EventDraft,
    validate_event_draft,
)
from kunyu.agent.runtime.projection.run.dispatch import _apply
from kunyu.agent.runtime.projection.run.guards import _pending_question
from kunyu.agent.runtime.projection.run.snapshot import _freeze
from kunyu.agent.runtime.projection.run_state import (
    ReducedRun,
    RunReductionError,
    _Budget,
    _State,
)


def reduce_run(events: Iterable[AgentEvent]) -> ReducedRun:
    """Fold a strictly ordered, single-run event sequence into one projection."""
    state: _State | None = None
    session_id: str | None = None
    run_id: str | None = None
    previous_sequence = 0
    user_message_id: str | None = None

    for envelope in events:
        if envelope.sequence <= previous_sequence:
            raise RunReductionError(
                "Run events must have strictly increasing sequences."
            )
        previous_sequence = envelope.sequence
        if envelope.run_id is None:
            raise RunReductionError("Every reduced event must identify its run.")
        if session_id is None:
            session_id = envelope.session_id
            run_id = envelope.run_id
        elif envelope.session_id != session_id or envelope.run_id != run_id:
            raise RunReductionError("Run replay cannot mix sessions or runs.")

        event = _typed_event(envelope)
        if isinstance(event, UserMessageAppendedEvent):
            if user_message_id is not None:
                raise RunReductionError(
                    "A run must contain exactly one user message event."
                )
            user_message_id = event.payload.message_id
            continue
        if isinstance(event, RunCreatedEvent):
            if state is not None:
                raise RunReductionError("A run can only be created once.")
            if user_message_id != event.payload.user_message_id:
                raise RunReductionError("Run creation does not match its user message.")
            limits = event.payload.budget_limits
            state = _State(
                run_id=envelope.run_id,
                session_id=event.session_id,
                user_message_id=event.payload.user_message_id,
                model_snapshot=event.payload.model_snapshot,
                map_snapshot=event.payload.map_snapshot,
                scene_snapshot=event.payload.scene_snapshot,
                limits=limits,
                budget=_Budget(
                    max_active_milliseconds=limits.active_milliseconds,
                ),
                created_at=event.occurred_at,
                created_sequence=envelope.sequence,
                updated_at=event.occurred_at,
                updated_sequence=envelope.sequence,
            )
            continue
        if state is None:
            raise RunReductionError("Run events must follow run.created.")
        if state.state in TERMINAL_RUN_STATES:
            raise RunReductionError(
                f"Terminal run '{state.run_id}' cannot accept more events."
            )

        _apply(state, event, envelope.sequence)
        state.updated_at = event.occurred_at
        state.updated_sequence = envelope.sequence

    if state is None:
        raise RunReductionError("Run replay is missing run.created.")
    if user_message_id != state.user_message_id:
        raise RunReductionError("Run replay is missing its user message event.")
    if not state.selected:
        raise RunReductionError("Run replay is missing run.model_selected.")
    if state.state is RunState.WAITING_CONFIRMATION:
        pending_confirmation_id = state.pending_confirmation_id
        if pending_confirmation_id is None:
            raise RunReductionError(
                "A waiting run must retain its pending confirmation."
            )
        confirmation = state.confirmations.get(pending_confirmation_id)
        if confirmation is None:
            raise RunReductionError("A waiting run references an unknown confirmation.")
        if confirmation.status != "pending":
            raise RunReductionError(
                "A resolved confirmation must commit its tool result or terminal run."
            )
    if state.state is RunState.WAITING_INPUT:
        question = _pending_question(state)
        if question.status != "pending":
            raise RunReductionError(
                "A resolved question must commit its tool result or terminal run."
            )
    return _freeze(state)


def _typed_event(envelope: AgentEvent) -> EventDraft:
    return validate_event_draft(
        {
            "session_id": envelope.session_id,
            "run_id": envelope.run_id,
            "event_type": envelope.event_type,
            "payload": envelope.payload,
            "occurred_at": envelope.occurred_at,
        }
    )
