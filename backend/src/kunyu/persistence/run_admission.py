"""Canonical turn admission facts for atomically claimed inbox input."""

from datetime import datetime

from kunyu.agent.runtime.events import (
    BudgetUsagePayload,
    EventDraft,
    InboxMessagePayload,
    RunCreatedEvent,
    RunCreatedPayload,
    RunModelSelectedEvent,
    RunModelSelectedPayload,
    RunProgressEvent,
    RunProgressPayload,
    UserMessageAppendedEvent,
    UserMessageAppendedPayload,
)


def turn_events(
    session_id: str, item: InboxMessagePayload, occurred_at: datetime
) -> tuple[EventDraft, ...]:
    turn = item.turn
    if turn is None:
        raise RuntimeError("Queued turn configuration is missing.")
    run_id, message_id = turn.run_id, item.message_id
    model_snapshot, budget_limits = turn.model_snapshot, turn.budget_limits
    return (
        UserMessageAppendedEvent(
            session_id=session_id,
            run_id=run_id,
            event_type="message.user.appended",
            payload=UserMessageAppendedPayload(
                message_id=message_id,
                role="user",
                content=item.content,
                run_id=run_id,
            ),
            occurred_at=occurred_at,
        ),
        RunCreatedEvent(
            session_id=session_id,
            run_id=run_id,
            event_type="run.created",
            payload=RunCreatedPayload(
                user_message_id=message_id,
                model_snapshot=model_snapshot,
                map_snapshot=item.map_context,
                scene_snapshot=None,
                budget_limits=budget_limits,
            ),
            occurred_at=occurred_at,
        ),
        RunModelSelectedEvent(
            session_id=session_id,
            run_id=run_id,
            event_type="run.model_selected",
            payload=RunModelSelectedPayload(
                user_message_id=message_id,
                model_snapshot=model_snapshot,
                budget_limits=budget_limits,
            ),
            occurred_at=occurred_at,
        ),
        RunProgressEvent(
            session_id=session_id,
            run_id=run_id,
            event_type="run.queued",
            payload=RunProgressPayload(
                step=0,
                attempt=0,
                resume_phase="model",
                next_tool_index=0,
                requires_resume=False,
                queue_sequence=turn.queue_sequence,
                reason=None,
                budget=BudgetUsagePayload(
                    model_calls=0,
                    tool_calls=0,
                    active_milliseconds=0,
                    output_codepoints=0,
                ),
            ),
            occurred_at=occurred_at,
        ),
    )
