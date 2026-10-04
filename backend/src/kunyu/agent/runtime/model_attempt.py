"""Streaming attempt state and durable settlement frame construction."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from kunyu.agent.runtime.assistant_stream import AssistantStreamAccumulator
from kunyu.agent.runtime.block_assembler import BlockAssembler
from kunyu.agent.runtime.events import (
    AssistantCompletedEvent,
    AssistantCompletedPayload,
    AssistantDeltaEvent,
    AssistantDeltaPayload,
    AssistantReasoningDeltaEvent,
    BudgetSettledEvent,
    BudgetSettledPayload,
    EventDraft,
    ModelAttemptFinishedEvent,
    ModelAttemptFinishedPayload,
)
from kunyu.agent.runtime.models import (
    ModelFinishReason,
    TokenUsage,
)
from kunyu.agent.runtime.run_state import ReducedRun
from kunyu.agent.runtime.runner_types import (
    DeltaBuffer,
)

type ModelOutcome = Literal[
    "stop", "tool_calls", "length", "content_filter", "cancelled", "error"
]
type AssistantFinish = Literal["stop", "tool_calls"]


@dataclass(slots=True)
class ModelAttempt:
    message_id: str
    operation_id: str
    reserved_milliseconds: int
    initial_active_milliseconds: int
    buffer: DeltaBuffer
    reasoning_buffer: DeltaBuffer
    output_limit: int
    stream: AssistantStreamAccumulator = field(
        default_factory=AssistantStreamAccumulator
    )
    assembler: BlockAssembler = field(default_factory=BlockAssembler)

    @property
    def usage(self) -> TokenUsage | None:
        return self.assembler.usage

    @property
    def finish(self) -> ModelFinishReason | None:
        return self.assembler.finish


def model_settlement_events(
    run: ReducedRun,
    attempt: ModelAttempt,
    elapsed_milliseconds: int,
    *,
    now: datetime,
    outcome: ModelOutcome,
    error_code: str | None,
    assistant_finish: AssistantFinish | None,
) -> list[EventDraft]:
    elapsed_milliseconds = min(
        attempt.reserved_milliseconds, max(0, elapsed_milliseconds)
    )
    events: list[EventDraft] = []
    pending = attempt.buffer.flush()
    if pending is not None:
        events.append(delta_event(run, attempt, pending, now))
    reasoning_pending = attempt.reasoning_buffer.flush()
    if reasoning_pending is not None:
        events.append(delta_event(run, attempt, reasoning_pending, now, reasoning=True))
    events.append(
        BudgetSettledEvent(
            session_id=run.session_id,
            run_id=run.run_id,
            event_type="run.budget_settled",
            payload=BudgetSettledPayload(
                operation_id=attempt.operation_id,
                operation_type="model",
                operation_count=1,
                reserved_milliseconds=attempt.reserved_milliseconds,
                actual_milliseconds=elapsed_milliseconds,
                charged_milliseconds=elapsed_milliseconds,
                crashed=False,
            ),
            occurred_at=now,
        )
    )
    if assistant_finish is not None:
        events.append(
            AssistantCompletedEvent(
                session_id=run.session_id,
                run_id=run.run_id,
                event_type="message.assistant.completed",
                payload=AssistantCompletedPayload(
                    message_id=attempt.message_id,
                    step=run.step,
                    attempt=run.attempt,
                    content_length=attempt.buffer.content_length,
                    finish_reason=assistant_finish,
                ),
                occurred_at=now,
            )
        )
    usage = attempt.usage or TokenUsage()
    events.append(
        ModelAttemptFinishedEvent(
            session_id=run.session_id,
            run_id=run.run_id,
            event_type="model.attempt.finished",
            payload=ModelAttemptFinishedPayload(
                message_id=attempt.message_id,
                step=run.step,
                attempt=run.attempt,
                outcome=outcome,
                error_code=error_code,
                input_tokens=usage.input_tokens,
                output_tokens=usage.output_tokens,
                total_tokens=usage.total_tokens,
                cumulative_active_milliseconds=(
                    attempt.initial_active_milliseconds + elapsed_milliseconds
                ),
                stream=attempt.stream.snapshot(),
                stream_origin="model",
                blocks=attempt.assembler.blocks(
                    interrupted=outcome not in {"stop", "tool_calls", "length"}
                    or error_code == "OUTPUT_LIMIT",
                    output_limit=attempt.output_limit,
                ),
                replay_state=attempt.assembler.replay_state
                if outcome in {"stop", "tool_calls", "length"}
                and error_code != "OUTPUT_LIMIT"
                else None,
            ),
            occurred_at=now,
        )
    )
    return events


def delta_event(
    run: ReducedRun,
    attempt: ModelAttempt,
    batch: tuple[int, str],
    occurred_at: datetime,
    *,
    reasoning: bool = False,
) -> AssistantDeltaEvent | AssistantReasoningDeltaEvent:
    offset, text = batch
    event_class = AssistantReasoningDeltaEvent if reasoning else AssistantDeltaEvent
    return event_class(
        session_id=run.session_id,
        run_id=run.run_id,
        event_type="message.assistant.reasoning.delta"
        if reasoning
        else "message.assistant.delta",
        payload=AssistantDeltaPayload(
            message_id=attempt.message_id,
            step=run.step,
            attempt=run.attempt,
            offset=offset,
            text=text,
        ),
        occurred_at=occurred_at,
    )
