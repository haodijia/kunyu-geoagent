"""Typed, ordered event batches and their durable storage boundary."""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal, Protocol, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    TypeAdapter,
    model_validator,
)

type NonNegativeInt = Annotated[int, Field(ge=0)]
type PositiveInt = Annotated[int, Field(gt=0)]


class RunState(StrEnum):
    READY = "ready"
    MODEL_RUNNING = "model_running"
    TOOL_RUNNING = "tool_running"
    WAITING_CONFIRMATION = "waiting_confirmation"
    INTERRUPTED = "interrupted"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ResumePhase(StrEnum):
    MODEL = "model"
    TOOL = "tool"


TERMINAL_RUN_STATES = frozenset(
    {RunState.COMPLETED, RunState.FAILED, RunState.CANCELLED}
)

ALLOWED_RUN_TRANSITIONS: Mapping[RunState, frozenset[RunState]] = {
    RunState.READY: frozenset(
        {
            RunState.READY,
            RunState.MODEL_RUNNING,
            RunState.TOOL_RUNNING,
            RunState.FAILED,
            RunState.CANCELLED,
        }
    ),
    RunState.MODEL_RUNNING: frozenset(
        {
            RunState.TOOL_RUNNING,
            RunState.WAITING_CONFIRMATION,
            RunState.COMPLETED,
            RunState.FAILED,
            RunState.INTERRUPTED,
            RunState.CANCELLED,
        }
    ),
    RunState.TOOL_RUNNING: frozenset(
        {
            RunState.MODEL_RUNNING,
            RunState.WAITING_CONFIRMATION,
            RunState.FAILED,
            RunState.INTERRUPTED,
            RunState.CANCELLED,
        }
    ),
    RunState.WAITING_CONFIRMATION: frozenset(
        {RunState.READY, RunState.CANCELLED}
    ),
    RunState.INTERRUPTED: frozenset({RunState.READY, RunState.CANCELLED}),
    RunState.COMPLETED: frozenset(),
    RunState.FAILED: frozenset(),
    RunState.CANCELLED: frozenset(),
}


class EventPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class SessionCreatedPayload(EventPayload):
    workspace_id: str
    title: str


class UserMessageAppendedPayload(EventPayload):
    message_id: str
    role: Literal["user"]


class BudgetLimitsPayload(EventPayload):
    model_calls: PositiveInt
    tool_calls: PositiveInt
    active_milliseconds: PositiveInt
    output_codepoints: PositiveInt


class BudgetUsagePayload(EventPayload):
    model_calls: NonNegativeInt
    tool_calls: NonNegativeInt
    active_milliseconds: NonNegativeInt
    output_codepoints: NonNegativeInt
    input_tokens: NonNegativeInt | None = None
    output_tokens: NonNegativeInt | None = None
    total_tokens: NonNegativeInt | None = None


class RunCreatedPayload(EventPayload):
    user_message_id: str
    model_snapshot: dict[str, JsonValue]
    map_snapshot: dict[str, JsonValue]
    scene_snapshot: dict[str, JsonValue] | None
    budget_limits: BudgetLimitsPayload


class RunModelSelectedPayload(EventPayload):
    user_message_id: str
    model_snapshot: dict[str, JsonValue]
    budget_limits: BudgetLimitsPayload


class RunProgressPayload(EventPayload):
    step: NonNegativeInt
    attempt: NonNegativeInt
    resume_phase: Literal["model", "tool"]
    next_tool_index: NonNegativeInt
    requires_resume: bool
    queue_sequence: PositiveInt | None
    reason: str | None
    budget: BudgetUsagePayload


class BudgetReservedPayload(EventPayload):
    operation_id: str
    operation_type: Literal["model", "tool"]
    operation_count: PositiveInt
    reserved_milliseconds: PositiveInt


class BudgetSettledPayload(EventPayload):
    operation_id: str
    operation_type: Literal["model", "tool"]
    operation_count: PositiveInt
    reserved_milliseconds: PositiveInt
    actual_milliseconds: NonNegativeInt | None
    charged_milliseconds: NonNegativeInt
    crashed: bool


class AssistantStartedPayload(EventPayload):
    message_id: str
    step: PositiveInt
    attempt: PositiveInt


class AssistantDeltaPayload(EventPayload):
    message_id: str
    step: PositiveInt
    attempt: PositiveInt
    offset: NonNegativeInt
    text: str


class AssistantCompletedPayload(EventPayload):
    message_id: str
    step: PositiveInt
    attempt: PositiveInt
    content_length: NonNegativeInt
    finish_reason: Literal["stop", "tool_calls"]


class ModelAttemptFinishedPayload(EventPayload):
    step: PositiveInt
    attempt: PositiveInt
    outcome: Literal[
        "stop",
        "tool_calls",
        "length",
        "content_filter",
        "cancelled",
        "error",
    ]
    error_code: str | None
    input_tokens: NonNegativeInt | None
    output_tokens: NonNegativeInt | None
    total_tokens: NonNegativeInt | None
    cumulative_active_milliseconds: NonNegativeInt


class ToolRequestedPayload(EventPayload):
    tool_call_id: str
    provider_call_id: str
    message_id: str
    step: PositiveInt
    attempt: PositiveInt
    batch_index: NonNegativeInt
    name: str
    arguments: dict[str, JsonValue]


class ToolProgressPayload(EventPayload):
    tool_call_id: str
    provider_call_id: str
    message_id: str
    batch_index: NonNegativeInt
    next_tool_index: NonNegativeInt


class ToolCompletedPayload(ToolProgressPayload):
    result: JsonValue


class ToolFailedPayload(ToolProgressPayload):
    error_code: str
    error_summary: str


class ConfirmationRequestedPayload(EventPayload):
    confirmation_id: str
    tool_call_id: str
    name: str
    arguments: dict[str, JsonValue]
    summary: str


class ConfirmationResolvedPayload(EventPayload):
    confirmation_id: str
    tool_call_id: str
    decision: Literal["approved", "rejected", "cancelled"]
    decided_at: datetime


class RunTerminalPayload(EventPayload):
    state: Literal["completed", "failed", "cancelled"]
    reason: str | None
    budget: BudgetUsagePayload


class _EventDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    session_id: str
    run_id: str | None = None
    occurred_at: datetime


class SessionCreatedEvent(_EventDraft):
    event_type: Literal["session.created"]
    payload: SessionCreatedPayload


class UserMessageAppendedEvent(_EventDraft):
    event_type: Literal["message.user.appended"]
    payload: UserMessageAppendedPayload


class RunCreatedEvent(_EventDraft):
    event_type: Literal["run.created"]
    run_id: str
    payload: RunCreatedPayload


class RunModelSelectedEvent(_EventDraft):
    event_type: Literal["run.model_selected"]
    run_id: str
    payload: RunModelSelectedPayload


class RunProgressEvent(_EventDraft):
    event_type: Literal[
        "run.started",
        "run.resumed",
        "run.interrupted",
        "run.recovery_required",
    ]
    run_id: str
    payload: RunProgressPayload


class BudgetReservedEvent(_EventDraft):
    event_type: Literal["run.budget_reserved"]
    run_id: str
    payload: BudgetReservedPayload


class BudgetSettledEvent(_EventDraft):
    event_type: Literal["run.budget_settled"]
    run_id: str
    payload: BudgetSettledPayload


class AssistantStartedEvent(_EventDraft):
    event_type: Literal["message.assistant.started"]
    run_id: str
    payload: AssistantStartedPayload


class AssistantDeltaEvent(_EventDraft):
    event_type: Literal["message.assistant.delta"]
    run_id: str
    payload: AssistantDeltaPayload


class AssistantCompletedEvent(_EventDraft):
    event_type: Literal["message.assistant.completed"]
    run_id: str
    payload: AssistantCompletedPayload


class ModelAttemptFinishedEvent(_EventDraft):
    event_type: Literal["model.attempt.finished"]
    run_id: str
    payload: ModelAttemptFinishedPayload


class ToolRequestedEvent(_EventDraft):
    event_type: Literal["tool.requested"]
    run_id: str
    payload: ToolRequestedPayload


class ToolProgressEvent(_EventDraft):
    event_type: Literal["tool.started", "tool.cancelled"]
    run_id: str
    payload: ToolProgressPayload


class ToolCompletedEvent(_EventDraft):
    event_type: Literal["tool.completed"]
    run_id: str
    payload: ToolCompletedPayload


class ToolFailedEvent(_EventDraft):
    event_type: Literal["tool.failed"]
    run_id: str
    payload: ToolFailedPayload


class ConfirmationRequestedEvent(_EventDraft):
    event_type: Literal["confirmation.requested"]
    run_id: str
    payload: ConfirmationRequestedPayload


class ConfirmationResolvedEvent(_EventDraft):
    event_type: Literal["confirmation.resolved"]
    run_id: str
    payload: ConfirmationResolvedPayload


class RunTerminalEvent(_EventDraft):
    event_type: Literal["run.completed", "run.failed", "run.cancelled"]
    run_id: str
    payload: RunTerminalPayload

    @model_validator(mode="after")
    def validate_terminal_state(self) -> Self:
        if self.event_type.removeprefix("run.") != self.payload.state:
            raise ValueError("Run terminal event type and state must match.")
        return self


type EventDraft = Annotated[
    SessionCreatedEvent
    | UserMessageAppendedEvent
    | RunCreatedEvent
    | RunModelSelectedEvent
    | RunProgressEvent
    | BudgetReservedEvent
    | BudgetSettledEvent
    | AssistantStartedEvent
    | AssistantDeltaEvent
    | AssistantCompletedEvent
    | ModelAttemptFinishedEvent
    | ToolRequestedEvent
    | ToolProgressEvent
    | ToolCompletedEvent
    | ToolFailedEvent
    | ConfirmationRequestedEvent
    | ConfirmationResolvedEvent
    | RunTerminalEvent,
    Field(discriminator="event_type"),
]

_EVENT_DRAFT_ADAPTER = TypeAdapter(EventDraft)


def validate_event_draft(value: object) -> EventDraft:
    return _EVENT_DRAFT_ADAPTER.validate_python(value)


@dataclass(frozen=True, slots=True)
class AgentEvent:
    id: str
    session_id: str
    sequence: int
    event_type: str
    payload: Mapping[str, object]
    occurred_at: datetime
    run_id: str | None = None


@dataclass(frozen=True, slots=True)
class EventBatch[ProjectionT]:
    """Events and their query projection committed as one storage unit."""

    session_id: str
    run_id: str | None
    events: tuple[EventDraft, ...]
    projection: ProjectionT

    def __post_init__(self) -> None:
        if not self.events:
            raise ValueError("An event batch must contain at least one event.")
        for event in self.events:
            if event.session_id != self.session_id or event.run_id != self.run_id:
                raise ValueError("Every event must belong to the batch session and run.")


class EventStore[ProjectionT](Protocol):
    async def commit(
        self, batch: EventBatch[ProjectionT]
    ) -> tuple[AgentEvent, ...]: ...

    async def list_after(
        self, session_id: str, sequence: int
    ) -> tuple[AgentEvent, ...]: ...
