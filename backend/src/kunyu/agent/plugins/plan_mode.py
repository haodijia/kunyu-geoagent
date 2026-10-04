"""Compose plan guidance, step selection and the stable review tool."""

from kunyu.agent import services as s
from kunyu.agent.plan_mode import narrate_plan_selection, plan_guidance, plan_policy
from kunyu.agent.runtime.context import PromptSection
from kunyu.agent.scope import Context
from kunyu.agent.tools.plan_mode import ExitPlanModeHandler, ExitPlanModeTool
from kunyu.agent.tools.registry import ToolRegistration


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
