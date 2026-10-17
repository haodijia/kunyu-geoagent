"""Mount task-list capability through the scoped tool registry."""

from functools import partial

from kunyu.agent.core import services as s
from kunyu.agent.core.scope import Context
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.agent.tools.workflow.todo import TodoWriteTool


class TodoToolsPlugin:
    name = "tool-todo"
    requires = (s.TOOLS, s.CONTEXTS)
    provides = ()

    async def apply(self, context: Context) -> None:
        context.require(s.TOOLS).register(
            context,
            "todo_write",
            ToolRegistration(
                partial(TodoWriteTool, contexts=context.require(s.CONTEXTS))
            ),
        )
