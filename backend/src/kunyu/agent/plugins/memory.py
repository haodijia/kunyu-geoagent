"""Contribute only the two requested workspace-memory tools."""

from functools import partial
from uuid import uuid4

from kunyu.agent import services as s
from kunyu.agent.scope import Context
from kunyu.agent.tools.memory import MemoryReadTool, MemoryWriteHandler, MemoryWriteTool
from kunyu.agent.tools.registry import ToolRegistration


class MemoryToolsPlugin:
    name = "memory-tools"
    requires = (s.TOOLS, s.CONTEXTS, s.MEMORIES)
    provides = ()

    async def apply(self, context: Context) -> None:
        tools = context.require(s.TOOLS)
        contexts = context.require(s.CONTEXTS)
        tools.register(
            context,
            "memory_read",
            ToolRegistration(
                partial(
                    MemoryReadTool,
                    contexts=contexts,
                    memories=context.require(s.MEMORIES),
                )
            ),
        )
        tools.register(
            context,
            "memory_write",
            ToolRegistration(
                partial(MemoryWriteTool, contexts=contexts),
                MemoryWriteHandler(lambda: f"mem_{uuid4().hex}"),
            ),
        )
