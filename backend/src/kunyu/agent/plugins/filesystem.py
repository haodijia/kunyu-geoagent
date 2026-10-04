"""Compose a filesystem provider separately from its model-facing tools."""

from functools import partial

from kunyu.agent import services as s
from kunyu.agent.runtime.context import PromptSection
from kunyu.agent.scope import Context
from kunyu.agent.tools.files import ReadTool
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.integrations.filesystem import MountedFilesystem


class FilesystemPlugin:
    name = "workspace-filesystem"
    requires = (s.DATABASE, s.ATTACHMENTS)
    provides = (s.FILESYSTEM,)

    async def apply(self, context: Context) -> None:
        context.provide(
            s.FILESYSTEM,
            MountedFilesystem(
                context.require(s.DATABASE).path.parent, context.require(s.ATTACHMENTS)
            ),
        )


class FilesystemToolsPlugin:
    name = "filesystem-tools"
    requires = (s.TOOLS, s.CONTEXTS, s.FILESYSTEM, s.PROMPTS)
    provides = ()

    async def apply(self, context: Context) -> None:
        context.require(s.TOOLS).register(
            context,
            "read",
            ToolRegistration(
                partial(
                    ReadTool,
                    contexts=context.require(s.CONTEXTS),
                    filesystem=context.require(s.FILESYSTEM),
                )
            ),
        )
        context.require(s.PROMPTS).register(
            context,
            PromptSection(
                "tool:read",
                40,
                lambda _: (
                    "Current working directory: /workspace. Use the read tool to inspect UTF-8 text files; results include line numbers. Use offset and limit to continue large files. /workspace mounts the current workspace's managed files. /attachments paths are read-only and must already appear in this run's current history. Only use tools actually provided by this request."
                ),
            ),
        )
