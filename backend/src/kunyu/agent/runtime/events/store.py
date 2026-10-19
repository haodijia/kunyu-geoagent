"""Typed store events and validation."""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Protocol

from pydantic import Field, TypeAdapter

from kunyu.agent.runtime.events.assistant import (
    AssistantCompletedEvent,
    AssistantDeltaEvent,
    AssistantReasoningDeltaEvent,
    AssistantStartedEvent,
    ModelAttemptFinishedEvent,
    RequestHeaderEvent,
    StepDecisionEvent,
)
from kunyu.agent.runtime.events.context import (
    CompactionFinishedEvent,
    CompactionSelectionEvent,
    CompactionStartedEvent,
    HistoryCompactedEvent,
    ImageOffloadEvent,
)
from kunyu.agent.runtime.events.run import (
    BudgetReservedEvent,
    BudgetSettledEvent,
    RetryScheduledEvent,
    RetryStartedEvent,
    RunCreatedEvent,
    RunModelSelectedEvent,
    RunProgressEvent,
    RunTerminalEvent,
)
from kunyu.agent.runtime.events.session import (
    BusinessObjectChangedEvent,
    CommandDoneEvent,
    CommandRunEvent,
    ContextInjectedEvent,
    FeedbackRecordedEvent,
    InboxSplicedEvent,
    JobChangedEvent,
    PermissionChangedEvent,
    PlanChangedEvent,
    PlanSelectedEvent,
    QueueDispatchedEvent,
    QueueModeEvent,
    QueueReorderedEvent,
    SessionCreatedEvent,
    SubagentCreatedEvent,
    SubagentSettledEvent,
    UserMessageAppendedEvent,
)
from kunyu.agent.runtime.events.tools import (
    ConfirmationRequestedEvent,
    ConfirmationResolvedEvent,
    PlanExitSelectedEvent,
    QuestionRequestedEvent,
    QuestionResolvedEvent,
    TodoWriteEvent,
    ToolCompletedEvent,
    ToolFailedEvent,
    ToolProgressEvent,
    ToolRequestedEvent,
)

type EventDraft = Annotated[
    SessionCreatedEvent
    | BusinessObjectChangedEvent
    | JobChangedEvent
    | UserMessageAppendedEvent
    | ContextInjectedEvent
    | InboxSplicedEvent
    | QueueModeEvent
    | QueueReorderedEvent
    | QueueDispatchedEvent
    | CommandRunEvent
    | CommandDoneEvent
    | PlanChangedEvent
    | PlanSelectedEvent
    | PlanExitSelectedEvent
    | PermissionChangedEvent
    | SubagentCreatedEvent
    | SubagentSettledEvent
    | FeedbackRecordedEvent
    | HistoryCompactedEvent
    | CompactionStartedEvent
    | CompactionFinishedEvent
    | CompactionSelectionEvent
    | ImageOffloadEvent
    | RunCreatedEvent
    | RunModelSelectedEvent
    | RunProgressEvent
    | BudgetReservedEvent
    | RetryScheduledEvent
    | RetryStartedEvent
    | BudgetSettledEvent
    | RequestHeaderEvent
    | StepDecisionEvent
    | AssistantStartedEvent
    | AssistantDeltaEvent
    | AssistantReasoningDeltaEvent
    | AssistantCompletedEvent
    | ModelAttemptFinishedEvent
    | ToolRequestedEvent
    | ToolProgressEvent
    | ToolCompletedEvent
    | TodoWriteEvent
    | ToolFailedEvent
    | ConfirmationRequestedEvent
    | ConfirmationResolvedEvent
    | QuestionRequestedEvent
    | QuestionResolvedEvent
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
            if event.session_id != self.session_id or (
                self.run_id is not None and event.run_id != self.run_id
            ):
                raise ValueError(
                    "Every event must belong to its session and optional run boundary."
                )


class EventStore(Protocol):
    async def commit(self, batch: EventBatch) -> tuple[AgentEvent, ...]: ...

    async def list_after(
        self, session_id: str, sequence: int
    ) -> tuple[AgentEvent, ...]: ...
