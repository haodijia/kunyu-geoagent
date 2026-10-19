"""Typed session events and validation."""

from typing import Literal, Self

from pydantic import Field, JsonValue, model_validator

from kunyu.agent.runtime.events.base import (
    EventPayload,
    NonNegativeInt,
    PositiveInt,
    _EventDraft,
    _SessionEventDraft,
)
from kunyu.agent.runtime.events.run import BudgetLimitsPayload, ModelSnapshotPayload
from kunyu.domain.conversation.attachments import (
    MAX_ATTACHMENTS,
    MAX_BATCH_BYTES,
    Attachment,
)


class SessionCreatedPayload(EventPayload):
    workspace_id: str
    title: str


class MessageInputPayload(EventPayload):
    content: str = Field(max_length=32_768)
    source: Literal["user", "tool-jobs"] = "user"
    attachments: tuple[Attachment, ...] = Field(default=(), max_length=MAX_ATTACHMENTS)

    @model_validator(mode="after")
    def valid_input(self) -> Self:
        if not self.content.strip() and not self.attachments:
            raise ValueError("Message requires text or attachments.")
        if len({ref.id for ref in self.attachments}) != len(self.attachments):
            raise ValueError("Message attachment identities must be unique.")
        if sum(ref.bytes for ref in self.attachments) > MAX_BATCH_BYTES:
            raise ValueError("Message attachments exceed the byte limit.")
        return self


class UserMessageAppendedPayload(MessageInputPayload):
    message_id: str
    role: Literal["user"]
    run_id: str | None


class ContextInjectedPayload(EventPayload):
    content: str
    producer: str = "injected"
    metadata: dict[str, JsonValue] = Field(default_factory=dict)


class QueueModePayload(EventPayload):
    mode: Literal["auto", "manual"]


class QueueReorderedPayload(EventPayload):
    message_ids: list[str] = Field(max_length=32)


class QueueDispatchedPayload(EventPayload):
    message_id: str = Field(min_length=1, max_length=64)


class CommandRunPayload(EventPayload):
    command_id: str
    definition_id: str
    name: str
    raw_input: str | None


class CommandDonePayload(EventPayload):
    command_id: str
    kind: Literal["success", "error"]
    text: str
    source_event_sequence: int | None = None


class PlanChangedPayload(EventPayload):
    active: bool


class PermissionChangedPayload(EventPayload):
    preset: Literal["read-only", "workspace-write"]


class SubagentCreatedPayload(EventPayload):
    child_session_id: str = Field(min_length=1, max_length=64)
    child_run_id: str = Field(min_length=1, max_length=64)
    owner_run_id: str = Field(min_length=1, max_length=64)
    tool_call_id: str = Field(min_length=1, max_length=64)
    description: str = Field(min_length=1, max_length=200)
    prompt: str = Field(min_length=1, max_length=32_768)
    permission: Literal["read-only"]
    model_snapshot: "ModelSnapshotPayload"


class SubagentSettledPayload(EventPayload):
    child_session_id: str = Field(min_length=1, max_length=64)
    owner_run_id: str = Field(min_length=1, max_length=64)
    status: Literal["completed", "failed", "cancelled", "interrupted"]
    output: str = Field(max_length=32_768)
    reason: str | None


class FeedbackRecordedPayload(EventPayload):
    text: str


class QueuedTurnPayload(EventPayload):
    run_id: str
    queue_sequence: PositiveInt
    model_snapshot: ModelSnapshotPayload
    budget_limits: BudgetLimitsPayload


class InboxMessagePayload(MessageInputPayload):
    message_id: str = Field(min_length=1, max_length=64)
    map_context: dict[str, JsonValue]
    turn: QueuedTurnPayload | None = None


class InboxSplicedPayload(EventPayload):
    target: Literal["next-step", "next-turn"]
    target_run_id: str
    start: NonNegativeInt
    delete_count: NonNegativeInt
    messages: list[InboxMessagePayload]
    disposition: Literal["claim", "discard"] | None = None
    step: PositiveInt | None = None


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


class ContextInjectedEvent(_EventDraft):
    event_type: Literal["context.injected"]
    payload: ContextInjectedPayload

    @model_validator(mode="after")
    def validate_session_scope(self) -> Self:
        if self.run_id is not None:
            raise ValueError("Injected context must be scoped to the session.")
        return self


class CommandRunEvent(_SessionEventDraft):
    event_type: Literal["command/run"]
    payload: CommandRunPayload


class InboxSplicedEvent(_SessionEventDraft):
    event_type: Literal["agent/inbox/spliced"]
    payload: InboxSplicedPayload


class QueueModeEvent(_SessionEventDraft):
    event_type: Literal["agent/queue/mode"]
    payload: QueueModePayload


class QueueReorderedEvent(_SessionEventDraft):
    event_type: Literal["agent/queue/reordered"]
    payload: QueueReorderedPayload


class QueueDispatchedEvent(_SessionEventDraft):
    event_type: Literal["agent/queue/dispatched"]
    payload: QueueDispatchedPayload


class CommandDoneEvent(_SessionEventDraft):
    event_type: Literal["command/done"]
    payload: CommandDonePayload


class PlanChangedEvent(_SessionEventDraft):
    event_type: Literal["plan/changed"]
    payload: PlanChangedPayload


class PlanSelectedEvent(_SessionEventDraft):
    event_type: Literal["plan/selected"]
    payload: PlanChangedPayload


class PermissionChangedEvent(_SessionEventDraft):
    event_type: Literal["permission/changed"]
    payload: PermissionChangedPayload


class SubagentCreatedEvent(_SessionEventDraft):
    event_type: Literal["subagent/created"]
    payload: SubagentCreatedPayload


class SubagentSettledEvent(_SessionEventDraft):
    event_type: Literal["subagent/settled"]
    payload: SubagentSettledPayload


class FeedbackRecordedEvent(_SessionEventDraft):
    event_type: Literal["feedback/record"]
    payload: FeedbackRecordedPayload


class BusinessObjectPayload(EventPayload):
    object_id: str
    revision: int = Field(ge=1)
    state: str | None = None


class BusinessObjectChangedEvent(_SessionEventDraft):
    event_type: Literal["analysis/job", "analysis/output", "map/changed"]
    payload: BusinessObjectPayload


class JobChangedPayload(EventPayload):
    id: str = Field(min_length=1, max_length=128)
    owner_run_id: str
    tool_call_id: str
    kind: str
    label: str
    status: Literal["running", "stopping", "completed", "failed", "killed"]
    detail: str | None
    started_at: float
    finished_at: float | None


class JobChangedEvent(_SessionEventDraft):
    event_type: Literal["job/changed"]
    payload: JobChangedPayload
