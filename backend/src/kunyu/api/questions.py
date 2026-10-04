"""Session-bound human questions and exact answer/dismiss actions."""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict

from kunyu.agent.runtime.questions import Question, QuestionAnswers
from kunyu.agent.scheduler import RunQueueFullError, RunSchedulerClosingError
from kunyu.api.agent_dependencies import RunSchedulerDependency
from kunyu.api.errors import ApiError
from kunyu.api.run_models import AgentTurnResponse
from kunyu.application.questions import UserQuestionService
from kunyu.domain.questions import (
    QuestionConflictError,
    QuestionDecision,
    QuestionNotFoundError,
    QuestionSnapshot,
)

router = APIRouter(prefix="/api/v1", tags=["questions"])


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QuestionResponse(BaseModel):
    id: str
    session_id: str
    run_id: str
    tool_call_id: str
    questions: tuple[Question, ...]
    status: Literal["pending", "answered", "dismissed", "cancelled"]
    answer: QuestionAnswers | None
    created_at: datetime
    updated_at: datetime
    updated_sequence: int

    @classmethod
    def from_snapshot(cls, snapshot: QuestionSnapshot) -> "QuestionResponse":
        question = snapshot.question
        return cls(
            id=question.question_id,
            session_id=snapshot.session_id,
            run_id=snapshot.run_id,
            tool_call_id=question.tool_call_id,
            questions=question.request.questions,
            status=question.status,
            answer=question.answer,
            created_at=question.created_at,
            updated_at=question.updated_at,
            updated_sequence=question.updated_sequence,
        )


class QuestionDecisionResponse(BaseModel):
    question: QuestionResponse
    turn: AgentTurnResponse
    continuation_required: bool


def service(request: Request) -> UserQuestionService:
    return request.app.state.question_service


QuestionServiceDependency = Annotated[UserQuestionService, Depends(service)]


@router.get("/sessions/{session_id}/questions", response_model=list[QuestionResponse])
def list_questions(session_id: str, questions: QuestionServiceDependency):
    try:
        return [
            QuestionResponse.from_snapshot(item)
            for item in questions.list_for_session(session_id)
        ]
    except QuestionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error


async def decide(
    question_id: str,
    answer: QuestionAnswers | None,
    scheduler: RunSchedulerDependency,
    request: Request,
) -> QuestionDecisionResponse:
    try:
        result: QuestionDecision = await scheduler.answer_question(question_id, answer)
    except QuestionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except QuestionConflictError as error:
        raise ApiError(409, "QUESTION_CONFLICT", str(error)) from error
    except RunQueueFullError as error:
        raise ApiError(429, "RUN_QUEUE_FULL", str(error)) from error
    except RunSchedulerClosingError as error:
        raise ApiError(503, "BACKEND_SHUTTING_DOWN", str(error)) from error
    except ValueError as error:
        raise ApiError(422, "INVALID_ANSWER", str(error)) from error
    details = request.app.state.run_lifecycle_service.get_details(
        result.question.run_id
    )
    return QuestionDecisionResponse(
        question=QuestionResponse.from_snapshot(result.question),
        turn=AgentTurnResponse.from_domain(
            details.run, details.model_snapshot, details.tool_calls
        ),
        continuation_required=result.continuation_required,
    )


@router.post("/questions/{question_id}/answer", response_model=QuestionDecisionResponse)
async def answer_question(
    question_id: str,
    body: QuestionAnswers,
    scheduler: RunSchedulerDependency,
    request: Request,
):
    return await decide(question_id, body, scheduler, request)


@router.post(
    "/questions/{question_id}/dismiss", response_model=QuestionDecisionResponse
)
async def dismiss_question(
    question_id: str,
    body: EmptyRequest,
    scheduler: RunSchedulerDependency,
    request: Request,
):
    return await decide(question_id, None, scheduler, request)
