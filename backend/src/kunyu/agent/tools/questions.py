"""Model-facing consumer of the human-question interaction seam."""

from collections.abc import Mapping

from pydantic import Field

from kunyu.agent.runtime.questions import (
    Question,
    QuestionAnswers,
    QuestionInput,
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
    require_bound_call,
    tool_result,
    validate_model,
)


class _AskArguments(ToolArguments):
    questions: list[QuestionInput] = Field(min_length=1, max_length=10)


class AskUserQuestionTool:
    def __init__(self, run_id: str) -> None:
        self._run_id = run_id
        self.spec = ToolSpec(
            name="ask_user_question",
            description="Ask the user a concise question when you need confirmation, a choice, or missing information before proceeding. Send one or more questions, each with a stable id echoed in the answer. Put a recommended option first and append (Recommended) to its label.",
            parameters=_AskArguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="exclusive",
            presentation="context",
            interaction=True,
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        validated = validate_model(self.spec.name, _AskArguments, arguments)
        QuestionSet(
            questions=tuple(
                Question.model_validate(q.model_dump()) for q in validated.questions
            )
        )
        return validated.model_dump(mode="json")

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        raise ToolExecutionError(
            "Human questions require the interaction service.",
            code="QUESTION_PROVIDER_REQUIRED",
        )


class AskUserQuestionHandler:
    def questions(self, call: ToolCall) -> QuestionSet:
        arguments = validate_model(call.name, _AskArguments, call.arguments)
        return QuestionSet(
            questions=tuple(
                Question.model_validate(q.model_dump()) for q in arguments.questions
            )
        )

    def resolve(self, call: ToolCall, answer: QuestionAnswers | None) -> ToolResult:
        if answer is None:
            raise ToolExecutionError(
                "The user dismissed the question to speak instead. Stop here and wait for their message.",
                code="ASK_CANCELLED",
            )
        return tool_result(answer.model_dump(mode="json", exclude_none=True))
