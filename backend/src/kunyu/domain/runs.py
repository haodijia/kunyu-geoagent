from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import JsonValue

from dsh.events import TERMINAL_RUN_STATES, ResumePhase, RunState
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


class ProjectionConflictError(RuntimeError):
    pass


class ProjectionNotFoundError(LookupError):
    pass


NONTERMINAL_RUN_STATE_VALUES = tuple(
    state.value for state in RunState if state not in TERMINAL_RUN_STATES
)

type AssistantFinishReason = Literal["stop", "tool_calls"]
