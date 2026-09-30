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
    RunState.WAITING_CONFIRMATION: frozenset({RunState.READY, RunState.CANCELLED}),
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
    content: str
    run_id: str | None


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


class ModelSnapshotPayload(EventPayload):
    connection_id: str
    provider_type: str
    protocol: Literal["openai_compatible"]
    base_url: str
    auth_mode: Literal["api_key", "none"]
    model_id: str
    reasoning_effort: str | None
    connection_revision: PositiveInt
    max_tokens_field: Literal["max_tokens", "max_completion_tokens"]
    include_usage: bool
    max_output_tokens: PositiveInt


class RunCreatedPayload(EventPayload):
    user_message_id: str
    model_snapshot: ModelSnapshotPayload
    map_snapshot: dict[str, JsonValue]
    scene_snapshot: dict[str, JsonValue] | None
    budget_limits: BudgetLimitsPayload


class RunModelSelectedPayload(EventPayload):
    user_message_id: str
    model_snapshot: ModelSnapshotPayload
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


class RequestHeaderPayload(EventPayload):
    message_id: str
    step: PositiveInt
    attempt: PositiveInt
    model_id: str
    reasoning_effort: str | None
    max_output_tokens: PositiveInt
    system_prompt: str
    messages: list[dict[str, JsonValue]]
    tools: list[dict[str, JsonValue]]


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
    execution: Literal["parallel", "exclusive"]
    presentation: Literal["context", "search", "write"]


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
    workspace_id: str
    name: str
    arguments: dict[str, JsonValue]
    summary: str
    side_effect: str


class ConfirmationResolvedPayload(EventPayload):
    confirmation_id: str
    tool_call_id: str
    decision: Literal["approved", "rejected", "cancelled"]
    decided_at: datetime


class RunTerminalPayload(EventPayload):
    state: Literal["completed", "failed", "cancelled"]
    reason: str | None
    budget: BudgetUsagePayload


class _EventBase(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    session_id: str
    occurred_at: datetime


class _EventDraft(_EventBase):
    run_id: str | None = None


class _RunEventDraft(_EventBase):
    run_id: str


class SessionCreatedEvent(_EventDraft):
    event_type: Literal["session.created"]
    payload: SessionCreatedPayload


class UserMessageAppendedEvent(_EventDraft):
    event_type: Literal["message.user.appended"]
    payload: UserMessageAppendedPayload

    @model_validator(mode="after")
    def validate_run_identity(self) -> Self:
        if self.payload.run_id != self.run_id:
            raise ValueError("User message payload and envelope run IDs must match.")
        return self


class RunCreatedEvent(_RunEventDraft):
    event_type: Literal["run.created"]
    payload: RunCreatedPayload


class RunModelSelectedEvent(_RunEventDraft):
    event_type: Literal["run.model_selected"]
    payload: RunModelSelectedPayload


class RunProgressEvent(_RunEventDraft):
    event_type: Literal[
        "run.started",
        "run.queued",
        "run.resumed",
        "run.interrupted",
        "run.recovery_required",
    ]
    payload: RunProgressPayload


class BudgetReservedEvent(_RunEventDraft):
    event_type: Literal["run.budget_reserved"]
    payload: BudgetReservedPayload


class BudgetSettledEvent(_RunEventDraft):
    event_type: Literal["run.budget_settled"]
    payload: BudgetSettledPayload


class AssistantStartedEvent(_RunEventDraft):
    event_type: Literal["message.assistant.started"]
    payload: AssistantStartedPayload


class RequestHeaderEvent(_RunEventDraft):
    event_type: Literal["request.header"]
    payload: RequestHeaderPayload


class AssistantDeltaEvent(_RunEventDraft):
    event_type: Literal["message.assistant.delta"]
    payload: AssistantDeltaPayload


class AssistantCompletedEvent(_RunEventDraft):
    event_type: Literal["message.assistant.completed"]
    payload: AssistantCompletedPayload


class ModelAttemptFinishedEvent(_RunEventDraft):
    event_type: Literal["model.attempt.finished"]
    payload: ModelAttemptFinishedPayload


class ToolRequestedEvent(_RunEventDraft):
    event_type: Literal["tool.requested"]
    payload: ToolRequestedPayload


class ToolProgressEvent(_RunEventDraft):
    event_type: Literal["tool.started", "tool.cancelled"]
    payload: ToolProgressPayload


class ToolCompletedEvent(_RunEventDraft):
    event_type: Literal["tool.completed"]
    payload: ToolCompletedPayload


class ToolFailedEvent(_RunEventDraft):
    event_type: Literal["tool.failed"]
    payload: ToolFailedPayload


class ConfirmationRequestedEvent(_RunEventDraft):
    event_type: Literal["confirmation.requested"]
    payload: ConfirmationRequestedPayload


class ConfirmationResolvedEvent(_RunEventDraft):
    event_type: Literal["confirmation.resolved"]
    payload: ConfirmationResolvedPayload


class RunTerminalEvent(_RunEventDraft):
    event_type: Literal["run.completed", "run.failed", "run.cancelled"]
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
    | RequestHeaderEvent
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
class EventBatch:
    """Events committed as one storage unit."""

    session_id: str
    run_id: str | None
    events: tuple[EventDraft, ...]

    def __post_init__(self) -> None:
        if not self.events:
            raise ValueError("An event batch must contain at least one event.")
        for event in self.events:
            if event.session_id != self.session_id or event.run_id != self.run_id:
                raise ValueError(
                    "Every event must belong to the batch session and run."
                )


class EventStore(Protocol):
    async def commit(self, batch: EventBatch) -> tuple[AgentEvent, ...]: ...

    async def list_after(
        self, session_id: str, sequence: int
    ) -> tuple[AgentEvent, ...]: ...
