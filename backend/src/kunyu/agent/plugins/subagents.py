"""Install independent child supervision and scoped model-facing tools."""

from functools import partial

from kunyu.agent import services as s
from kunyu.agent.scope import Context
from kunyu.agent.subagents import SubagentManager
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.agent.tools.workflow.subagents import SubagentTool
from kunyu.persistence.subagents import SQLAlchemySubagentRepository


class SubagentsPlugin:
    name = "subagents"
    requires = (s.DATABASE, s.CONTEXTS, s.PROJECTIONS, s.EVENTS, s.TOOLS)
    provides = (s.SUBAGENTS,)

    async def apply(self, context: Context) -> None:
        manager = SubagentManager(
            SQLAlchemySubagentRepository(
                context.require(s.DATABASE), context.require(s.PROJECTIONS)
            ),
            context.require(s.CONTEXTS),
            context.require(s.EVENTS),
        )
        context.provide(s.SUBAGENTS, manager)
        context.effect(manager.close, before_children=True)
        for name in ("subagent", "wait_subagents", "cancel_subagent", "subagent_result"):
            context.require(s.TOOLS).register(
                context,
                name,
                ToolRegistration(partial(SubagentTool, manager=manager, name=name)),
            )
