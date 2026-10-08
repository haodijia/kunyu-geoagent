from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Literal, Protocol

from pydantic import JsonValue

from kunyu.domain.runs import Run, RunModelSnapshot, ToolCall


class ConfirmationStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


@dataclass(frozen=True, slots=True)
class Confirmation:
    id: str
    session_id: str
    run_id: str
    tool_call_id: str
    workspace_id: str
    name: str
    arguments: dict[str, JsonValue]
    summary: str
    side_effect: str
    execution: Literal["transaction", "tool"]
    binding: str | None
    status: ConfirmationStatus
    decided_at: datetime | None
    created_at: datetime
    updated_at: datetime
    updated_sequence: int


@dataclass(frozen=True, slots=True)
class ConfirmationDecisionResult:
    confirmation: Confirmation
    tool_call: ToolCall
    run: Run
    model_snapshot: RunModelSnapshot
    tool_calls: tuple[ToolCall, ...]
    continuation_required: bool


class ConfirmationRepository(Protocol):
    def list_for_session(self, session_id: str) -> tuple[Confirmation, ...] | None: ...

    def get(self, confirmation_id: str) -> Confirmation | None: ...


class ConfirmationNotFoundError(LookupError):
    def __init__(self, confirmation_id: str) -> None:
        self.confirmation_id = confirmation_id
        super().__init__(f"Confirmation '{confirmation_id}' was not found.")


class ConfirmationConflictError(RuntimeError):
    pass


class ConfirmationPolicyError(RuntimeError):
    pass
