"""Typed run events and validation."""

from typing import Literal, Self

from pydantic import Field, JsonValue, model_validator

from kunyu.agent.runtime.contracts.retry_policy import RetryPolicy
from kunyu.agent.runtime.events.base import (
    EventPayload,
    NonNegativeInt,
    PositiveInt,
    _RunEventDraft,
)
from kunyu.domain.models.model_images import ModelImageInput
from kunyu.domain.models.model_reasoning import (
    ReasoningParameters,
    require_parameter_protocol,
)


class BudgetLimitsPayload(EventPayload):
    active_milliseconds: PositiveInt


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
    protocol: Literal["openai_compatible", "deepseek_messages", "openai_responses"]
    base_url: str
    auth_mode: Literal["api_key", "none"]
    model_id: str
    reasoning_effort: str | None
    reasoning_parameters: ReasoningParameters
    connection_revision: PositiveInt
    max_tokens_field: Literal["max_tokens", "max_completion_tokens"]
    include_usage: bool
    max_output_tokens: PositiveInt
    context_window: PositiveInt | None
    retention_tokens: NonNegativeInt
    retry_policy: RetryPolicy
    image_input: ModelImageInput = ModelImageInput()

    @model_validator(mode="after")
    def validate_reasoning_parameters(self) -> Self:
        require_parameter_protocol(self.protocol, self.reasoning_parameters)
        if (
            self.context_window is not None
            and self.max_output_tokens + self.retention_tokens >= self.context_window
        ):
            raise ValueError(
                "The frozen context window cannot hold output and retention reserves."
            )
        return self


class RequestFailurePayload(EventPayload):
    code: str
    message: str
    provider_retry_after_ms: float | None = Field(
        default=None, gt=0, allow_inf_nan=False
    )


class RetryScheduledPayload(EventPayload):
    retry_id: str
    step: PositiveInt
    attempt: PositiveInt
    provider: str
    mode: Literal["normal", "always"]
    policy_key: str
    retry: PositiveInt
    max_retries: NonNegativeInt | None
    delay_ms: float = Field(ge=0, allow_inf_nan=False)
    failure: RequestFailurePayload

    @model_validator(mode="after")
    def validate_mode(self) -> Self:
        if self.mode == "normal" and (
            self.max_retries is None or self.retry > self.max_retries
        ):
            raise ValueError("Normal retry must remain within its policy budget.")
        if self.mode == "always" and self.max_retries is not None:
            raise ValueError("Always retry cannot contain a retry-count limit.")
        return self


class RetryStartedPayload(EventPayload):
    retry_id: str
    step: PositiveInt
    attempt: PositiveInt
    retry: PositiveInt


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


class RunTerminalPayload(EventPayload):
    state: Literal["completed", "failed", "cancelled"]
    reason: str | None
    budget: BudgetUsagePayload


class RunCreatedEvent(_RunEventDraft):
    event_type: Literal["run.created"]
    payload: RunCreatedPayload


class RunModelSelectedEvent(_RunEventDraft):
    event_type: Literal["run.model_selected"]
    payload: RunModelSelectedPayload


class RunProgressEvent(_RunEventDraft):
    event_type: Literal[
        "run.started",
        "run.retried",
        "run.queued",
        "run.resumed",
        "run.interrupted",
        "run.recovery_required",
    ]
    payload: RunProgressPayload


class BudgetReservedEvent(_RunEventDraft):
    event_type: Literal["run.budget_reserved"]
    payload: BudgetReservedPayload


class RetryScheduledEvent(_RunEventDraft):
    event_type: Literal["llm/retry"]
    payload: RetryScheduledPayload


class RetryStartedEvent(_RunEventDraft):
    event_type: Literal["llm/retry-started"]
    payload: RetryStartedPayload


class BudgetSettledEvent(_RunEventDraft):
    event_type: Literal["run.budget_settled"]
    payload: BudgetSettledPayload


class RunTerminalEvent(_RunEventDraft):
    event_type: Literal["run.completed", "run.failed", "run.cancelled"]
    payload: RunTerminalPayload

    @model_validator(mode="after")
    def validate_terminal_state(self) -> Self:
        if self.event_type.removeprefix("run.") != self.payload.state:
            raise ValueError("Run terminal event type and state must match.")
        return self
