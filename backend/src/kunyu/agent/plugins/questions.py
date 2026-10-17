"""Compose the durable question service and its model-facing tool."""

from kunyu.agent.core import services as s
from kunyu.agent.core.scope import Context
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.agent.tools.workflow.questions import (
    AskUserQuestionHandler,
    AskUserQuestionTool,
)
from kunyu.application.execution.questions import UserQuestionService


class UserQuestionsPlugin:
    name = "user-questions"
    requires = (s.DATABASE, s.PROJECTIONS, s.TOOLS)
    provides = (s.QUESTIONS,)

    async def apply(self, context: Context) -> None:
        context.provide(
            s.QUESTIONS,
            UserQuestionService(
                context.require(s.DATABASE),
                context.require(s.PROJECTIONS),
                context.require(s.TOOLS),
            ),
        )
        context.require(s.TOOLS).register(
            context,
            "ask_user_question",
            ToolRegistration(
                AskUserQuestionTool, question_handler=AskUserQuestionHandler()
            ),
        )
