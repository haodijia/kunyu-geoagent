"""Typed base events and validation."""

from collections.abc import Mapping
from datetime import datetime
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

type NonNegativeInt = Annotated[int, Field(ge=0)]


type PositiveInt = Annotated[int, Field(gt=0)]


class RunState(StrEnum):
    READY = "ready"
    MODEL_RUNNING = "model_running"
    TOOL_RUNNING = "tool_running"
    WAITING_CONFIRMATION = "waiting_confirmation"
    WAITING_INPUT = "waiting_input"
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
            RunState.COMPLETED,
            RunState.FAILED,
            RunState.CANCELLED,
        }
    ),
    RunState.MODEL_RUNNING: frozenset(
        {
            RunState.MODEL_RUNNING,
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
            RunState.WAITING_INPUT,
            RunState.MODEL_RUNNING,
            RunState.WAITING_CONFIRMATION,
            RunState.FAILED,
            RunState.INTERRUPTED,
            RunState.CANCELLED,
        }
    ),
    RunState.WAITING_CONFIRMATION: frozenset({RunState.READY, RunState.CANCELLED}),
    RunState.WAITING_INPUT: frozenset(
        {RunState.READY, RunState.CANCELLED, RunState.FAILED}
    ),
    RunState.INTERRUPTED: frozenset({RunState.READY, RunState.CANCELLED}),
    RunState.COMPLETED: frozenset(),
    RunState.FAILED: frozenset(),
    RunState.CANCELLED: frozenset(),
}


class EventPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class _EventBase(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    session_id: str
    occurred_at: datetime


class _EventDraft(_EventBase):
    run_id: str | None = None


class _RunEventDraft(_EventBase):
    run_id: str


class _SessionEventDraft(_EventBase):
    run_id: None = None
