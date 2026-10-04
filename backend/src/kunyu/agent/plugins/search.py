"""Search is subprocess-backed discovery, independent of the filesystem provider."""

from functools import partial

from kunyu.agent import services as s
from kunyu.agent.runtime.context import PromptSection
from kunyu.agent.scope import Context
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.agent.tools.search import SearchTool
from kunyu.integrations.search_storage import WorkspaceSearchStorage
from kunyu.integrations.subprocess import LocalSubprocess


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
                lambda _: (
                    "Use glob to find files and grep to locate matching lines in /workspace before using read or edit. Paths are relative to /workspace; path may restrict the search to a file or subtree. glob includes hidden and ignored files except VCS internals, sorts by modification time, and samples over-cap results across top-level entries. grep uses ripgrep regular expressions and defaults to hidden and ignore rules; its one positive include glob overrides those rules for matching files (brace alternatives are allowed). Capped results save their complete formatted output to a read-only, session-owned file; use read with the returned file_path and offset/limit to retrieve it. Internal recovery files are excluded from searches. Searches do not observe file versions for write/edit: read the file before modifying it."
                ),
            ),
        )
