"""Compose a filesystem provider separately from its model-facing tools."""

from functools import partial

from kunyu.agent import services as s
from kunyu.agent.filesystem import FilesystemHooks, ObservedStateGate
from kunyu.agent.runtime.context import PromptSection
from kunyu.agent.scope import Context
from kunyu.agent.tools.file_mutations import FileMutationTool
from kunyu.agent.tools.files import ReadTool
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.integrations.filesystem import MountedFilesystem


class FilesystemPlugin:
    name = "workspace-filesystem"
    requires = (s.DATABASE, s.ATTACHMENTS)
    provides = (s.FILESYSTEM, s.FILESYSTEM_HOOKS)

    async def apply(self, context: Context) -> None:
        hooks = FilesystemHooks()
        filesystem = MountedFilesystem(
            context.require(s.DATABASE).path.parent, context.require(s.ATTACHMENTS)
        )
        context.provide(s.FILESYSTEM_HOOKS, hooks)
        context.provide(s.FILESYSTEM, filesystem)
        context.effect(filesystem.watches.close)
        hooks.observed.register(
            context, "workspace-file-changes", filesystem.watches.observed
        )


class FilesystemObservationPlugin:
    name = "fs-observation-policy"
    requires = (s.FILESYSTEM_HOOKS,)
    provides = ()

    async def apply(self, context: Context) -> None:
        gate = ObservedStateGate()
        context.effect(gate.clear)
        hooks = context.require(s.FILESYSTEM_HOOKS)
        hooks.observed.register(context, "observation-policy", gate.observe)
        hooks.write_intent.register(context, "decision", gate.write_intent)
        hooks.edit_intent.register(context, "decision", gate.edit_intent)


class FilesystemToolsPlugin:
    name = "filesystem-tools"
    requires = (
        s.TOOLS,
        s.CONTEXTS,
        s.FILESYSTEM,
        s.FILESYSTEM_HOOKS,
        s.SCOPES,
        s.PROMPTS,
    )
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
                    hooks=context.require(s.FILESYSTEM_HOOKS),
                    scopes=context.require(s.SCOPES),
                )
            ),
        )
        for name in ("write", "edit"):
            context.require(s.TOOLS).register(
                context,
                name,
                ToolRegistration(
                    partial(
                        FileMutationTool,
                        name=name,
                        contexts=context.require(s.CONTEXTS),
                        filesystem=context.require(s.FILESYSTEM),
                        hooks=context.require(s.FILESYSTEM_HOOKS),
                        scopes=context.require(s.SCOPES),
                    )
                ),
            )
        context.require(s.PROMPTS).register(
            context,
            PromptSection(
                "tool:write",
                41,
                lambda _: (
                    "Use write to create files or completely replace file contents in /workspace. Read an existing file first and prefer edit for targeted changes. Use edit to replace literal old_string with new_string; old_string must match exactly once unless replace_all is true. Read the file first unless you just created or edited it in this session. A changed file must be re-read before retrying. /attachments mounts are read-only."
                ),
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
