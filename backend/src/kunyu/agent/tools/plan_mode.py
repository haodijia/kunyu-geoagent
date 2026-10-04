"""Present complete plans through the shared human-question channel."""

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Self

from pydantic import Field, model_validator

from kunyu.agent.runtime.content import TextBlock
from kunyu.agent.runtime.events import PlanExitSelectedEvent, PlanExitSelectedPayload
from kunyu.agent.runtime.questions import (
    PlanReviewIntent,
    Question,
    QuestionAnswers,
    QuestionOption,
    QuestionSet,
)
from kunyu.agent.runtime.tools import (
    ToolCall,
    ToolExecutionError,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    validate_model,
)
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.plans import plan_title

REVIEW_ID = "plan-review"
APPROVE = "Approve"
KEEP_PLANNING = "Keep planning"


class ExitPlanArguments(ToolArguments):
    plan: str = Field(
        min_length=1,
        max_length=32768,
        description="The complete plan as Markdown, starting with a # heading that names it.",
    )

    @model_validator(mode="after")
    def complete_plan(self) -> Self:
        plan_title(self.plan)
        return self


class ExitPlanModeTool:
    def __init__(self, run_id: str) -> None:
        self._run_id = run_id
        self.spec = ToolSpec(
            name="exit_plan_mode",
            description="Use only in plan mode. Present your COMPLETE plan as Markdown, starting with a # heading that names it, for user review. On approval leave plan mode and carry out the plan from your next step. Feedback means keep planning, revise and present again.",
            parameters=ExitPlanArguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="exclusive",
            presentation="context",
            interaction=True,
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_model(self.spec.name, ExitPlanArguments, arguments).model_dump(
            mode="json"
        )

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        raise ToolExecutionError(
            "Plan review requires the human-question channel.",
            code="QUESTION_PROVIDER_REQUIRED",
        )


class ExitPlanModeHandler:
    def __init__(self, contexts: RunContextRepository) -> None:
        self._contexts = contexts

    def questions(self, call: ToolCall) -> QuestionSet:
        source = load_source(self._contexts, call.run_id)
        if not source.controls.plan_active:
            raise ToolExecutionError(
                "exit_plan_mode is only available in plan mode.",
                code="PLAN_MODE_INACTIVE",
            )
        arguments = validate_model(call.name, ExitPlanArguments, call.arguments)
        return QuestionSet(
            questions=(
                Question(
                    id=REVIEW_ID,
                    header="Plan review",
                    question="Approve this plan and leave plan mode?",
                    detail=arguments.plan,
                    options=(
                        QuestionOption(
                            label=APPROVE,
                            description="Leave plan mode; carry out the plan from the next step.",
                        ),
                        QuestionOption(
                            label=KEEP_PLANNING,
                            description="Stay in plan mode; feedback goes back to the model.",
                        ),
                    ),
                    intent=PlanReviewIntent(approve=APPROVE, call_id=call.call_id),
                ),
            )
        )

    def resolve(self, call: ToolCall, answer: QuestionAnswers | None) -> ToolResult:
        if answer is None:
            raise ToolExecutionError(
                "The user dismissed the plan review to speak instead; stay in plan mode, stop here, and wait for their message.",
                code="ASK_CANCELLED",
            )
        if len(answer.answers) != 1 or answer.answers[0].id != REVIEW_ID:
            raise ToolExecutionError(
                "Plan review requires its exact answer.", code="PLAN_REVIEW_INVALID"
            )
        item = answer.answers[0]
        if item.selected != (APPROVE,) or item.custom is not None:
            text = (
                "The user chose to keep planning; revise the plan and present it again."
            )
            if item.custom is not None:
                text = f"The user chose to keep planning; their feedback: {item.custom}"
            raise ToolExecutionError(text, code="PLAN_NOT_APPROVED")
        source = load_source(self._contexts, call.run_id)
        return ToolResult(
            result={"approved": True},
            content=(
                TextBlock(
                    text="Plan approved — plan mode exited; carry out the plan starting with your next step."
                ),
            ),
            events=(
                PlanExitSelectedEvent(
                    session_id=source.session.id,
                    run_id=call.run_id,
                    event_type="plan/exit-selected",
                    payload=PlanExitSelectedPayload(tool_call_id=call.call_id),
                    occurred_at=datetime.now(UTC),
                ),
            ),
        )
