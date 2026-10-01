"""Immutable run projections and private mutable reducer state."""

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from pydantic import JsonValue

from kunyu.agent.runtime.events import (
    BudgetLimitsPayload,
    ModelSnapshotPayload,
    ResumePhase,
    RunState,
)

type AssistantStatus = Literal[
    "streaming", "completed", "interrupted", "failed", "cancelled"
]
type ToolStatus = Literal["pending", "running", "completed", "failed", "cancelled"]
type ConfirmationStatus = Literal["pending", "approved", "rejected", "cancelled"]


class RunReductionError(ValueError):
    """The durable event sequence cannot represent a valid run."""


@dataclass(frozen=True, slots=True)
class ReducedBudget:
    max_model_calls: int
    model_calls: int
    max_tool_calls: int
    tool_calls: int
    max_active_milliseconds: int
    active_milliseconds: int
    max_output_codepoints: int
    output_codepoints: int
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None


@dataclass(frozen=True, slots=True)
class ReducedAssistant:
    message_id: str
    step: int
    attempt: int
    content: str
    status: AssistantStatus
    finish_reason: Literal["stop", "tool_calls"] | None
    created_at: datetime
    updated_at: datetime
    created_sequence: int
    updated_sequence: int


@dataclass(frozen=True, slots=True)
class ReducedToolCall:
    tool_call_id: str
    provider_call_id: str
    message_id: str
    step: int
    attempt: int
    batch_index: int
    name: str
    arguments: Mapping[str, JsonValue]
    status: ToolStatus
    result: JsonValue | None
    error_code: str | None
    error_summary: str | None
    created_at: datetime
    updated_at: datetime
    created_sequence: int
    updated_sequence: int


@dataclass(frozen=True, slots=True)
class ReducedConfirmation:
    confirmation_id: str
    tool_call_id: str
    workspace_id: str
    name: str
    arguments: Mapping[str, JsonValue]
    summary: str
    side_effect: str
    status: ConfirmationStatus
    decided_at: datetime | None
    created_at: datetime
    updated_at: datetime
    created_sequence: int
    updated_sequence: int


@dataclass(frozen=True, slots=True)
class ReducedRun:
    run_id: str
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
    model_snapshot: ModelSnapshotPayload
    map_snapshot: Mapping[str, JsonValue]
    scene_snapshot: Mapping[str, JsonValue] | None
    budget: ReducedBudget
    assistants: tuple[ReducedAssistant, ...]
    tool_calls: tuple[ReducedToolCall, ...]
    confirmations: tuple[ReducedConfirmation, ...]
    created_at: datetime
    updated_at: datetime
    created_sequence: int
    updated_sequence: int


@dataclass(slots=True)
class _Budget:
    max_model_calls: int
    max_tool_calls: int
    max_active_milliseconds: int
    max_output_codepoints: int
    model_calls: int = 0
    tool_calls: int = 0
    active_milliseconds: int = 0
    output_codepoints: int = 0
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


@dataclass(slots=True)
class _Assistant:
    message_id: str
    step: int
    attempt: int
    created_at: datetime
    created_sequence: int
    content: str = ""
    status: AssistantStatus = "streaming"
    finish_reason: Literal["stop", "tool_calls"] | None = None
    model_outcome: str | None = None
    updated_at: datetime | None = None
    updated_sequence: int = 0


@dataclass(slots=True)
class _ToolCall:
    tool_call_id: str
    provider_call_id: str
    message_id: str
    step: int
    attempt: int
    batch_index: int
    name: str
    arguments: Mapping[str, JsonValue]
    created_at: datetime
    created_sequence: int
    status: ToolStatus = "pending"
    result: JsonValue | None = None
    error_code: str | None = None
    error_summary: str | None = None
    updated_at: datetime | None = None
    updated_sequence: int = 0


@dataclass(slots=True)
class _Confirmation:
    confirmation_id: str
    tool_call_id: str
    workspace_id: str
    name: str
    arguments: Mapping[str, JsonValue]
    summary: str
    side_effect: str
    created_at: datetime
    created_sequence: int
    status: ConfirmationStatus = "pending"
    decided_at: datetime | None = None
    updated_at: datetime | None = None
    updated_sequence: int = 0


@dataclass(slots=True)
class _Reservation:
    operation_type: Literal["model", "tool"]
    operation_count: int
    reserved_milliseconds: int


@dataclass(slots=True)
class _State:
    run_id: str
    session_id: str
    user_message_id: str
    model_snapshot: ModelSnapshotPayload
    map_snapshot: Mapping[str, JsonValue]
    scene_snapshot: Mapping[str, JsonValue] | None
    limits: BudgetLimitsPayload
    budget: _Budget
    created_at: datetime
    created_sequence: int
    updated_at: datetime
    updated_sequence: int
    state: RunState = RunState.READY
    step: int = 0
    attempt: int = 0
    resume_phase: ResumePhase = ResumePhase.MODEL
    next_tool_index: int = 0
    requires_resume: bool = False
    queue_sequence: int | None = None
    pending_confirmation_id: str | None = None
    pending_confirmation_tool_id: str | None = None
    pause_reason: str | None = None
    selected: bool = False
    assistants: dict[str, _Assistant] = field(default_factory=dict)
    tools: dict[str, _ToolCall] = field(default_factory=dict)
    confirmations: dict[str, _Confirmation] = field(default_factory=dict)
    operation_ids: set[str] = field(default_factory=set)
    reservations: dict[str, _Reservation] = field(default_factory=dict)
