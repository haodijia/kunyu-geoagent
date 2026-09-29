from collections.abc import Callable
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, JsonValue

from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.application.confirmations import ConfirmationService
from kunyu.application.local_tools import LocalToolPolicyGate, LocalToolRegistryFactory
from kunyu.application.sessions import SessionNotFoundError
from kunyu.domain.confirmations import (
    Confirmation,
    ConfirmationConflictError,
    ConfirmationDecisionResult,
    ConfirmationNotFoundError,
    ConfirmationPolicyError,
)
from kunyu.domain.runs import Run, RunModelSnapshot, ToolCall
from kunyu.persistence.agent_context import SQLAlchemyRunContextRepository
from kunyu.persistence.database import Database
from kunyu.persistence.workspace_memory import SQLAlchemyWorkspaceMemoryRepository

router = APIRouter(prefix="/api/v1", tags=["confirmations"])


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ConfirmationResponse(BaseModel):
    id: str
    session_id: str
    run_id: str
    tool_call_id: str
    workspace_id: str
    name: str
    arguments: dict[str, JsonValue]
    summary: str
    side_effect: str
    status: Literal["pending", "approved", "rejected", "cancelled"]
    decided_at: datetime | None
    created_at: datetime
    updated_at: datetime
    updated_sequence: int

    @classmethod
    def from_domain(cls, confirmation: Confirmation) -> "ConfirmationResponse":
        return cls(
            id=confirmation.id,
            session_id=confirmation.session_id,
            run_id=confirmation.run_id,
            tool_call_id=confirmation.tool_call_id,
            workspace_id=confirmation.workspace_id,
            name=confirmation.name,
            arguments=confirmation.arguments,
            summary=confirmation.summary,
            side_effect=confirmation.side_effect,
            status=confirmation.status.value,
            decided_at=confirmation.decided_at,
            created_at=confirmation.created_at,
            updated_at=confirmation.updated_at,
            updated_sequence=confirmation.updated_sequence,
        )


class ToolCallResponse(BaseModel):
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
    status: Literal["pending", "running", "completed", "failed", "cancelled"]
    result: JsonValue | None
    error_code: str | None
    error_summary: str | None
    created_at: datetime
    updated_at: datetime
    updated_sequence: int

    @classmethod
    def from_domain(cls, tool: ToolCall) -> "ToolCallResponse":
        return cls(
            id=tool.id,
            session_id=tool.session_id,
            run_id=tool.run_id,
            message_id=tool.message_id,
            step=tool.step,
            attempt=tool.attempt,
            provider_call_id=tool.provider_call_id,
            batch_index=tool.batch_index,
            name=tool.name,
            arguments=tool.arguments,
            status=tool.status.value,
            result=tool.result,
            error_code=tool.error_code,
            error_summary=tool.error_summary,
            created_at=tool.created_at,
            updated_at=tool.updated_at,
            updated_sequence=tool.updated_sequence,
        )


class RunBudgetResponse(BaseModel):
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


class RunResponse(BaseModel):
    id: str
    session_id: str
    user_message_id: str
    state: Literal[
        "ready",
        "model_running",
        "tool_running",
        "waiting_confirmation",
        "interrupted",
        "completed",
        "failed",
        "cancelled",
    ]
    step: int
    attempt: int
    resume_phase: Literal["model", "tool"]
    next_tool_index: int
    requires_resume: bool
    queue_sequence: int | None
    pending_confirmation_id: str | None
    pause_reason: str | None
    model_snapshot: "RunModelSnapshotResponse"
    map_context: dict[str, JsonValue]
    scene: dict[str, JsonValue] | None
    budget: RunBudgetResponse
    tool_calls: list[ToolCallResponse]
    created_at: datetime
    updated_at: datetime
    updated_sequence: int

    @classmethod
    def from_domain(
        cls,
        run: Run,
        snapshot: RunModelSnapshot,
        tool_calls: tuple[ToolCall, ...],
    ) -> "RunResponse":
        return cls(
            id=run.id,
            session_id=run.session_id,
            user_message_id=run.user_message_id,
            state=run.state.value,
            step=run.step,
            attempt=run.attempt,
            resume_phase=run.resume_phase.value,
            next_tool_index=run.next_tool_index,
            requires_resume=run.requires_resume,
            queue_sequence=run.queue_sequence,
            pending_confirmation_id=run.pending_confirmation_id,
            pause_reason=run.pause_reason,
            model_snapshot=RunModelSnapshotResponse.from_domain(snapshot),
            map_context=snapshot.map_context,
            scene=snapshot.scene,
            budget=RunBudgetResponse(
                max_model_calls=run.budget.max_model_calls,
                model_calls=run.budget.model_calls,
                max_tool_calls=run.budget.max_tool_calls,
                tool_calls=run.budget.tool_calls,
                max_active_milliseconds=run.budget.max_active_milliseconds,
                active_milliseconds=run.budget.active_milliseconds,
                max_output_codepoints=run.budget.max_output_codepoints,
                output_codepoints=run.budget.output_codepoints,
                input_tokens=run.budget.input_tokens,
                output_tokens=run.budget.output_tokens,
                total_tokens=run.budget.total_tokens,
            ),
            tool_calls=[ToolCallResponse.from_domain(item) for item in tool_calls],
            created_at=run.created_at,
            updated_at=run.updated_at,
            updated_sequence=run.updated_sequence,
        )


class RunModelSnapshotResponse(BaseModel):
    connection_id: str
    provider_type: str
    protocol: Literal["openai_compatible"]
    base_url: str
    auth_mode: Literal["api_key", "none"]
    model_id: str
    reasoning_effort: str | None
    connection_revision: int
    max_tokens_field: Literal["max_tokens", "max_completion_tokens"]
    include_usage: bool
    max_output_tokens: int

    @classmethod
    def from_domain(cls, snapshot: RunModelSnapshot) -> "RunModelSnapshotResponse":
        return cls(
            connection_id=snapshot.connection_id,
            provider_type=snapshot.provider_type.value,
            protocol=snapshot.protocol.value,
            base_url=snapshot.base_url,
            auth_mode=snapshot.auth_mode.value,
            model_id=snapshot.model_id,
            reasoning_effort=snapshot.reasoning_effort,
            connection_revision=snapshot.connection_revision,
            max_tokens_field=snapshot.max_tokens_field.value,
            include_usage=snapshot.include_usage,
            max_output_tokens=snapshot.max_output_tokens,
        )


class ConfirmationDecisionResponse(BaseModel):
    confirmation: ConfirmationResponse
    tool_call: ToolCallResponse
    run: RunResponse
    continuation_required: bool

    @classmethod
    def from_domain(
        cls, result: ConfirmationDecisionResult
    ) -> "ConfirmationDecisionResponse":
        return cls(
            confirmation=ConfirmationResponse.from_domain(result.confirmation),
            tool_call=ToolCallResponse.from_domain(result.tool_call),
            run=RunResponse.from_domain(
                result.run,
                result.model_snapshot,
                result.tool_calls,
            ),
            continuation_required=result.continuation_required,
        )


def get_confirmation_service(
    database: Annotated[Database, Depends(get_database)],
) -> ConfirmationService:
    contexts = SQLAlchemyRunContextRepository(database)
    memories = SQLAlchemyWorkspaceMemoryRepository(database)
    return ConfirmationService(
        database,
        LocalToolRegistryFactory(contexts, memories),
        LocalToolPolicyGate(),
    )


ConfirmationServiceDependency = Annotated[
    ConfirmationService, Depends(get_confirmation_service)
]


@router.get(
    "/sessions/{session_id}/confirmations",
    response_model=list[ConfirmationResponse],
)
def list_confirmations(
    session_id: str,
    service: ConfirmationServiceDependency,
) -> list[ConfirmationResponse]:
    try:
        return [
            ConfirmationResponse.from_domain(item)
            for item in service.list_for_session(session_id)
        ]
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error


@router.post(
    "/confirmations/{confirmation_id}/approve",
    response_model=ConfirmationDecisionResponse,
)
def approve_confirmation(
    confirmation_id: str,
    _: EmptyRequest,
    service: ConfirmationServiceDependency,
) -> ConfirmationDecisionResponse:
    return _decide(service.approve, confirmation_id)


@router.post(
    "/confirmations/{confirmation_id}/reject",
    response_model=ConfirmationDecisionResponse,
)
def reject_confirmation(
    confirmation_id: str,
    _: EmptyRequest,
    service: ConfirmationServiceDependency,
) -> ConfirmationDecisionResponse:
    return _decide(service.reject, confirmation_id)


def _decide(
    operation: Callable[[str], ConfirmationDecisionResult],
    confirmation_id: str,
) -> ConfirmationDecisionResponse:
    try:
        result = operation(confirmation_id)
    except ConfirmationNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except (ConfirmationConflictError, ConfirmationPolicyError) as error:
        raise ApiError(409, "CONFIRMATION_CONFLICT", str(error)) from error
    return ConfirmationDecisionResponse.from_domain(result)
