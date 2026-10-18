"""Typed tools events and validation."""

from datetime import datetime
from typing import Literal, Self

from pydantic import Field, JsonValue, model_validator

from kunyu.agent.runtime.contracts.questions import QuestionAnswers, QuestionSet
from kunyu.agent.runtime.contracts.todos import TodoList
from kunyu.agent.runtime.contracts.tool_content import ToolContent
from kunyu.agent.runtime.contracts.tool_output import ToolCompaction, ToolDisplay
from kunyu.agent.runtime.events.base import (
    EventPayload,
    NonNegativeInt,
    PositiveInt,
    _RunEventDraft,
)


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
    content: ToolContent
    display: ToolDisplay
    compact: ToolCompaction


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
    execution: Literal["transaction", "tool"]
    binding: str | None = Field(max_length=1000)

    @model_validator(mode="after")
    def require_deferred_binding(self) -> Self:
        if self.execution == "tool" and (
            self.binding is None or not self.binding.strip()
        ):
            raise ValueError("Deferred confirmation requires its exact tool binding.")
        return self


class ConfirmationResolvedPayload(EventPayload):
    confirmation_id: str
    tool_call_id: str
    decision: Literal["approved", "rejected", "cancelled"]
    decided_at: datetime


class PlanExitSelectedPayload(EventPayload):
    tool_call_id: str = Field(min_length=1)


class PlanExitSelectedEvent(_RunEventDraft):
    event_type: Literal["plan/exit-selected"]
    payload: PlanExitSelectedPayload


class ToolRequestedEvent(_RunEventDraft):
    event_type: Literal["tool.requested"]
    payload: ToolRequestedPayload


class ToolProgressEvent(_RunEventDraft):
    event_type: Literal["tool.started", "tool.cancelled"]
    payload: ToolProgressPayload


class TodoWritePayload(EventPayload):
    tool_call_id: str
    todos: TodoList


class TodoWriteEvent(_RunEventDraft):
    event_type: Literal["todo/write"]
    payload: TodoWritePayload


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


class QuestionRequestedPayload(EventPayload):
    question_id: str
    tool_call_id: str
    request: QuestionSet


class QuestionResolvedPayload(EventPayload):
    question_id: str
    decision: Literal["answered", "dismissed", "cancelled"]
    answer: QuestionAnswers | None = None

    @model_validator(mode="after")
    def valid_answer(self) -> Self:
        if (self.decision == "answered") != (self.answer is not None):
            raise ValueError("Only an answered question carries an answer.")
        return self


class QuestionRequestedEvent(_RunEventDraft):
    event_type: Literal["question.requested"]
    payload: QuestionRequestedPayload


class QuestionResolvedEvent(_RunEventDraft):
    event_type: Literal["question.resolved"]
    payload: QuestionResolvedPayload
