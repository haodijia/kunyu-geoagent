"""Session-scoped, read-only submitted plan resources."""

from fastapi import APIRouter, Request
from pydantic import BaseModel

from kunyu.api.errors import ApiError
from kunyu.application.plans import PlanNotFoundError, read_submitted_plan

router = APIRouter(prefix="/api/v1/sessions/{session_id}/plans", tags=["plans"])


class SubmittedPlanResponse(BaseModel):
    tool_call_id: str
    title: str
    markdown: str


@router.get("/{tool_call_id}", response_model=SubmittedPlanResponse)
def plan_document(
    session_id: str, tool_call_id: str, request: Request
) -> SubmittedPlanResponse:
    try:
        plan = read_submitted_plan(request.app.state.database, session_id, tool_call_id)
    except PlanNotFoundError as error:
        raise ApiError(404, "PLAN_NOT_FOUND", str(error)) from error
    return SubmittedPlanResponse(
        tool_call_id=plan.tool_call_id, title=plan.title, markdown=plan.markdown
    )
