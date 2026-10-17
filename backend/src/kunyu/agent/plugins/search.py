"""Search is subprocess-backed discovery, independent of the filesystem provider."""

from functools import partial

from kunyu.agent.core import services as s
from kunyu.agent.core.scope import Context
from kunyu.agent.prompts.loader import prompt_text
from kunyu.agent.runtime.contracts.context import PromptSection
from kunyu.agent.tools.filesystem.search import SearchTool
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.integrations.filesystem.search_storage import WorkspaceSearchStorage
from kunyu.integrations.process.subprocess import LocalSubprocess


class SearchPlugin:
    name = "tool-fs-search"
    requires = (s.DATABASE, s.TOOLS, s.CONTEXTS, s.PROMPTS)
    provides = (s.SUBPROCESS,)

    async def apply(self, context: Context) -> None:
        subprocess = LocalSubprocess()
        context.provide(s.SUBPROCESS, subprocess)
        storage = WorkspaceSearchStorage(context.require(s.DATABASE).path.parent)
        for name in ("glob", "grep"):
            context.require(s.TOOLS).register(
                context,
                name,
                ToolRegistration(
                    partial(
                        SearchTool,
                        name=name,
                        contexts=context.require(s.CONTEXTS),
                        subprocess=subprocess,
                        storage=storage,
                    )
                ),
            )
        context.require(s.PROMPTS).register(
            context,
            PromptSection(
                "tool:search",
                39,
                lambda _: prompt_text("tool-guidance.yaml", "tool:search"),
            ),
        )
