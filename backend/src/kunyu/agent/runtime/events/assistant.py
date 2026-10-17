"""Typed assistant events and validation."""

from typing import Literal

from pydantic import Field, JsonValue

from kunyu.agent.runtime.contracts.content import ContentBlock, ReplayEnvelope
from kunyu.agent.runtime.events.base import (
    EventPayload,
    NonNegativeInt,
    PositiveInt,
    _RunEventDraft,
)
from kunyu.agent.runtime.events.run import ModelSnapshotPayload
from kunyu.agent.runtime.events.session import MessageInputPayload
from kunyu.agent.runtime.streaming.assistant_stream import AssistantStreamRecord


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
    model_snapshot: ModelSnapshotPayload
    system_prompt: str
    messages: list[dict[str, JsonValue]]
    tools: list[dict[str, JsonValue]]


class StepMessagePayload(MessageInputPayload):
    message_id: str = Field(min_length=1, max_length=64)


class StepDecisionPayload(EventPayload):
    step: PositiveInt
    attempt: PositiveInt
    input_ids: list[str]
    kind: Literal["enter", "reject"]
    messages: list[StepMessagePayload]
    reason: str | None


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
    message_id: str
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
    stream: tuple[AssistantStreamRecord, ...]
    blocks: tuple[ContentBlock, ...]
    replay_state: ReplayEnvelope | None
    stream_origin: Literal["model", "buffered"]


class AssistantStartedEvent(_RunEventDraft):
    event_type: Literal["message.assistant.started"]
    payload: AssistantStartedPayload


class RequestHeaderEvent(_RunEventDraft):
    event_type: Literal["request.header"]
    payload: RequestHeaderPayload


class StepDecisionEvent(_RunEventDraft):
    event_type: Literal["agent/step/decision"]
    payload: StepDecisionPayload


class AssistantDeltaEvent(_RunEventDraft):
    event_type: Literal["message.assistant.delta"]
    payload: AssistantDeltaPayload


class AssistantReasoningDeltaEvent(_RunEventDraft):
    event_type: Literal["message.assistant.reasoning.delta"]
    payload: AssistantDeltaPayload


class AssistantCompletedEvent(_RunEventDraft):
    event_type: Literal["message.assistant.completed"]
    payload: AssistantCompletedPayload


class ModelAttemptFinishedEvent(_RunEventDraft):
    event_type: Literal["model.attempt.finished"]
    payload: ModelAttemptFinishedPayload
