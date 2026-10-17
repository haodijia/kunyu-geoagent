"""Typed context events and validation."""

from typing import Annotated, Literal, Self

from pydantic import Field, JsonValue, model_validator

from kunyu.agent.runtime.contracts.content import ContentBlock, ReplayEnvelope
from kunyu.agent.runtime.events.base import (
    EventPayload,
    NonNegativeInt,
    PositiveInt,
    _SessionEventDraft,
)
from kunyu.agent.runtime.events.run import ModelSnapshotPayload
from kunyu.agent.runtime.streaming.assistant_stream import AssistantStreamRecord


class HistoryCompactedPayload(EventPayload):
    summary: str
    through_sequence: PositiveInt


class CompactionPressurePayload(EventPayload):
    estimated_prompt_tokens: PositiveInt
    estimated_tool_tokens: NonNegativeInt
    threshold_tokens: PositiveInt
    threshold_ratio: float = Field(gt=0, le=1)
    headroom_tokens: NonNegativeInt


class CompactionStartedPayload(EventPayload):
    compaction_id: str = Field(min_length=1, max_length=64)
    command_id: str | None = Field(min_length=1, max_length=64)
    trigger: Literal["manual", "pressure", "context-overflow"]
    owner_run_id: str | None = Field(min_length=1, max_length=64)
    pressure: CompactionPressurePayload | None
    source_run_id: str = Field(min_length=1, max_length=64)
    through_sequence: PositiveInt
    request_sequence: PositiveInt
    model_snapshot: "ModelSnapshotPayload"
    messages: tuple[dict[str, JsonValue], ...]
    tools: tuple[dict[str, JsonValue], ...]
    summary_template: str = Field(min_length=1)


class CompactionSelectionPayload(EventPayload):
    compaction_id: str = Field(min_length=1, max_length=64)
    compact_through_sequence: PositiveInt
    selected_sequences: tuple[PositiveInt, ...] = Field(min_length=1)
    retained_sequences: tuple[PositiveInt, ...]
    retained_messages: tuple[dict[str, JsonValue], ...]
    protected_messages: NonNegativeInt
    retention_tokens: NonNegativeInt
    estimated_selected_tokens: PositiveInt


class CompactionUsage(EventPayload):
    input_tokens: NonNegativeInt | None
    output_tokens: NonNegativeInt | None
    total_tokens: NonNegativeInt | None
    cache_read_input_tokens: NonNegativeInt | None
    cache_creation_input_tokens: NonNegativeInt | None


class CompactionFinishedPayload(EventPayload):
    compaction_id: str = Field(min_length=1, max_length=64)
    outcome: Literal["completed", "failed", "cancelled", "stale", "interrupted"]
    finish_reason: Literal["stop", "tool_calls", "length", "content_filter"] | None
    error_code: str | None
    blocks: tuple[ContentBlock, ...]
    stream: tuple[AssistantStreamRecord, ...]
    replay_state: ReplayEnvelope | None
    usage: CompactionUsage | None
    active_milliseconds: NonNegativeInt | None


class ImageOffloadTarget(EventPayload):
    sequence: int = Field(gt=0, strict=True)
    message_id: str = Field(min_length=1, max_length=64)
    image_indexes: tuple[Annotated[int, Field(ge=0, strict=True)], ...] = Field(
        min_length=1
    )

    @model_validator(mode="after")
    def ordered_indexes(self) -> Self:
        if tuple(sorted(set(self.image_indexes))) != self.image_indexes:
            raise ValueError("Image indexes must be strictly increasing.")
        return self


class ImageOffloadPayload(EventPayload):
    targets: tuple[ImageOffloadTarget, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_sources(self) -> Self:
        keys = {(item.sequence, item.message_id) for item in self.targets}
        if len(keys) != len(self.targets):
            raise ValueError("Image offload sources must be unique.")
        return self


class HistoryCompactedEvent(_SessionEventDraft):
    event_type: Literal["history/compacted"]
    payload: HistoryCompactedPayload


class CompactionStartedEvent(_SessionEventDraft):
    event_type: Literal["compaction/start"]
    payload: CompactionStartedPayload


class CompactionFinishedEvent(_SessionEventDraft):
    event_type: Literal["compaction/end"]
    payload: CompactionFinishedPayload


class CompactionSelectionEvent(_SessionEventDraft):
    event_type: Literal["compaction/selection"]
    payload: CompactionSelectionPayload


class ImageOffloadEvent(_SessionEventDraft):
    event_type: Literal["image/offload"]
    payload: ImageOffloadPayload
