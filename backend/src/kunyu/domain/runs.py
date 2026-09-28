from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Literal, TypeAlias

from pydantic import JsonValue

from dsh.events import ResumePhase, RunState, TERMINAL_RUN_STATES
from kunyu.domain.messages import Message
from kunyu.domain.model_connections import (
    MaxTokensField,
    ModelAuthMode,
    ModelProtocol,
    ModelProviderType,
)


class ToolCallStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(frozen=True, slots=True)
class RunBudget:
    max_model_calls: int = 8
    model_calls: int = 0
    max_tool_calls: int = 16
    tool_calls: int = 0
    max_active_milliseconds: int = 300_000
    active_milliseconds: int = 0
    max_output_codepoints: int = 32_768
    output_codepoints: int = 0
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


@dataclass(frozen=True, slots=True)
class Run:
    id: str
    session_id: str
    user_message_id: str
    state: RunState
    step: int
    attempt: int
    resume_phase: ResumePhase
    next_tool_index: int
    requires_resume: bool
    queue_sequence: int | None
    pending_confirmation_id: str | None
    pause_reason: str | None
    budget: RunBudget
    created_at: datetime
    updated_at: datetime
    updated_sequence: int


@dataclass(frozen=True, slots=True)
class RunModelSnapshot:
    run_id: str
    session_id: str
    connection_id: str
    provider_type: ModelProviderType
    protocol: ModelProtocol
    base_url: str
    auth_mode: ModelAuthMode
    model_id: str
    reasoning_effort: str | None
    connection_revision: int
    max_tokens_field: MaxTokensField
    include_usage: bool
    max_output_tokens: int
    map_context: dict[str, JsonValue]
    scene: dict[str, JsonValue] | None


@dataclass(frozen=True, slots=True)
class ToolCall:
    id: str
    session_id: str
    run_id: str
    message_id: str
    step: int
    attempt: int
    provider_call_id: str
    batch_index: int
    name: str
    arguments: dict[str, JsonValue]
    status: ToolCallStatus
    result: JsonValue | None
    error_code: str | None
    error_summary: str | None
    created_at: datetime
    updated_at: datetime
    updated_sequence: int


@dataclass(frozen=True, slots=True)
class CreateRunProjection:
    run: Run
    snapshot: RunModelSnapshot
    user_message: Message
    user_event_index: int
    run_event_index: int


@dataclass(frozen=True, slots=True)
class AddAssistantProjection:
    message: Message
    event_index: int


@dataclass(frozen=True, slots=True)
class AppendAssistantDeltaProjection:
    message_id: str
    step: int
    attempt: int
    offset: int
    text: str
    occurred_at: datetime
    event_index: int


@dataclass(frozen=True, slots=True)
class CompleteAssistantProjection:
    message_id: str
    step: int
    attempt: int
    content_length: int
    status: Literal["completed"]
    occurred_at: datetime
    event_index: int


@dataclass(frozen=True, slots=True)
class SettleAssistantProjection:
    message_id: str
    content_length: int
    status: Literal["interrupted", "failed", "cancelled"]
    occurred_at: datetime
    event_index: int


@dataclass(frozen=True, slots=True)
class AddToolCallsProjection:
    calls: tuple[ToolCall, ...]
    first_event_index: int


@dataclass(frozen=True, slots=True)
class UpdateToolCallProjection:
    tool_call_id: str
    status: ToolCallStatus
    result: JsonValue | None
    error_code: str | None
    error_summary: str | None
    occurred_at: datetime
    event_index: int


@dataclass(frozen=True, slots=True)
class UpdateRunProjection:
    run: Run
    event_index: int


RunProjectionMutation: TypeAlias = (
    CreateRunProjection
    | AddAssistantProjection
    | AppendAssistantDeltaProjection
    | CompleteAssistantProjection
    | SettleAssistantProjection
    | AddToolCallsProjection
    | UpdateToolCallProjection
    | UpdateRunProjection
)


@dataclass(frozen=True, slots=True)
class RunProjectionBatch:
    mutations: tuple[RunProjectionMutation, ...]


class ProjectionConflictError(RuntimeError):
    pass


class ProjectionNotFoundError(LookupError):
    pass


NONTERMINAL_RUN_STATE_VALUES = tuple(
    state.value for state in RunState if state not in TERMINAL_RUN_STATES
)

type AssistantFinishReason = Literal["stop", "tool_calls"]
