"""Compose plan guidance, step selection and the stable review tool."""

from kunyu.agent.capabilities.plan_mode import (
    narrate_plan_selection,
    plan_guidance,
    plan_policy,
)
from kunyu.agent.core import services as s
from kunyu.agent.core.scope import Context
from kunyu.agent.runtime.contracts.context import PromptSection
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.agent.tools.workflow.plan_mode import ExitPlanModeHandler, ExitPlanModeTool


class PlanModePlugin:
    name = "plan-mode"
    requires = (
        s.TOOLS,
        s.CONTEXTS,
        s.PROMPTS,
        s.HOOKS,
        s.DATABASE,
        s.PROJECTIONS,
        s.QUESTIONS,
    )
    provides = ()

    async def apply(self, context: Context) -> None:
        plan_guidance()
        context.require(s.TOOLS).register(
            context,
            "exit_plan_mode",
            ToolRegistration(
                ExitPlanModeTool,
                question_handler=ExitPlanModeHandler(context.require(s.CONTEXTS)),
            ),
        )
        context.require(s.PROMPTS).register(
            context, PromptSection("plan:policy", 30, plan_policy)
        )
        context.require(s.HOOKS).pre_step.register(
            context, "plan:selection", narrate_plan_selection
        )
