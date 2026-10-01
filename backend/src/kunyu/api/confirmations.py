from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, JsonValue

from kunyu.agent.scheduler import (
    RunQueueFullError,
    RunSchedulerClosingError,
)
from kunyu.api.agent import RunSchedulerDependency
from kunyu.api.errors import ApiError
from kunyu.api.run_models import AgentTurnResponse, ToolCallResponse
from kunyu.application.confirmations import ConfirmationService
from kunyu.application.sessions import SessionNotFoundError
from kunyu.domain.confirmations import (
    Confirmation,
    ConfirmationConflictError,
    ConfirmationDecisionResult,
    ConfirmationNotFoundError,
    ConfirmationPolicyError,
)

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


class ConfirmationDecisionResponse(BaseModel):
    confirmation: ConfirmationResponse
    tool_call: ToolCallResponse
    turn: AgentTurnResponse
    continuation_required: bool

    @classmethod
    def from_domain(
        cls, result: ConfirmationDecisionResult
    ) -> "ConfirmationDecisionResponse":
        return cls(
            confirmation=ConfirmationResponse.from_domain(result.confirmation),
            tool_call=ToolCallResponse.from_domain(result.tool_call),
            turn=AgentTurnResponse.from_domain(
                result.run,
                result.model_snapshot,
                result.tool_calls,
            ),
            continuation_required=result.continuation_required,
        )


def get_confirmation_service(
    request: Request,
) -> ConfirmationService:
    return request.app.state.confirmation_service


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
async def approve_confirmation(
    confirmation_id: str,
    _: EmptyRequest,
    scheduler: RunSchedulerDependency,
) -> ConfirmationDecisionResponse:
    try:
        return ConfirmationDecisionResponse.from_domain(
            await scheduler.approve(confirmation_id)
        )
    except RunQueueFullError as error:
        raise ApiError(429, "RUN_QUEUE_FULL", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error
    except ConfirmationNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except (ConfirmationConflictError, ConfirmationPolicyError) as error:
        raise ApiError(409, "CONFIRMATION_CONFLICT", str(error)) from error


@router.post(
    "/confirmations/{confirmation_id}/reject",
    response_model=ConfirmationDecisionResponse,
)
async def reject_confirmation(
    confirmation_id: str,
    _: EmptyRequest,
    scheduler: RunSchedulerDependency,
) -> ConfirmationDecisionResponse:
    try:
        result = await scheduler.reject(confirmation_id)
    except RunSchedulerClosingError as error:
        raise ApiError(503, "SHUTTING_DOWN", str(error)) from error
    except ConfirmationNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except (ConfirmationConflictError, ConfirmationPolicyError) as error:
        raise ApiError(409, "CONFIRMATION_CONFLICT", str(error)) from error
    return ConfirmationDecisionResponse.from_domain(result)
