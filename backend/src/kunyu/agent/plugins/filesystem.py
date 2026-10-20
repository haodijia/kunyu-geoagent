"""Compose a filesystem provider separately from its model-facing tools."""

from functools import partial
from pathlib import Path

from kunyu.agent.capabilities.filesystem import FilesystemHooks, ObservedStateGate
from kunyu.agent.core import services as s
from kunyu.agent.core.scope import Context
from kunyu.agent.prompts.loader import prompt_text
from kunyu.agent.runtime.contracts.context import PromptSection
from kunyu.agent.skills.filesystem import FilesystemSkillProvider
from kunyu.agent.tools.filesystem.file_mutations import FileMutationTool
from kunyu.agent.tools.filesystem.files import ReadTool
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.integrations.filesystem.local import MountedFilesystem


class FilesystemPlugin:
    name = "workspace-filesystem"
    requires = (s.DATABASE,)
    provides = (s.FILESYSTEM, s.FILESYSTEM_HOOKS)

    async def apply(self, context: Context) -> None:
        hooks = FilesystemHooks()
        directory = context.require(s.DATABASE).path.parent
        skills = FilesystemSkillProvider(
            directory, Path(__file__).parents[1] / "skills" / "bundled"
        )
        filesystem = MountedFilesystem(
            directory,
            read_roots=lambda scope: tuple(
                root.path for root in skills.roots(scope.workspace_id)
            ),
        )
        context.provide(s.FILESYSTEM_HOOKS, hooks)
        context.provide(s.FILESYSTEM, filesystem)


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
                lambda _: prompt_text("tool-guidance.yaml", "tool:write"),
            ),
        )
        context.require(s.PROMPTS).register(
            context,
            PromptSection(
                "tool:read",
                40,
                lambda _: prompt_text("tool-guidance.yaml", "tool:read"),
            ),
        )
