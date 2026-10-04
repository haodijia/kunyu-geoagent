"""Skill service, filesystem provider and consumer mount independently."""

from functools import partial
from pathlib import Path

from kunyu.agent import services as s
from kunyu.agent.scope import Context
from kunyu.agent.skills.context import prepare_skill_context
from kunyu.agent.skills.filesystem import FilesystemSkillProvider
from kunyu.agent.skills.registry import SkillRegistry
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.agent.tools.skills import SkillTool
from kunyu.settings import get_app_data_directory


class SkillPlugin:
    name = "skills"
    requires = ()
    provides = (s.SKILLS,)

    async def apply(self, context: Context) -> None:
        context.provide(s.SKILLS, SkillRegistry())


class FilesystemSkillsPlugin:
    name = "skills-filesystem"
    requires = (s.SKILLS,)
    provides = ()

    async def apply(self, context: Context) -> None:
        context.require(s.SKILLS).register(
            context,
            "filesystem",
            FilesystemSkillProvider(
                get_app_data_directory(), Path(__file__).parent / "bundled"
            ),
        )


class SkillToolsPlugin:
    name = "skill-tools"
    requires = (
        s.SKILLS,
        s.TOOLS,
        s.SCOPES,
        s.CONTEXTS,
        s.CONTEXT_PREPARERS,
        s.PROJECTIONS,
    )
    provides = ()

    async def apply(self, context: Context) -> None:
        registrations = {}
        for name, resource in (("skill", False), ("skill_resource", True)):
            registration = ToolRegistration(
                partial(
                    SkillTool,
                    contexts=context.require(s.CONTEXTS),
                    skills=context.require(s.SKILLS),
                    scopes=context.require(s.SCOPES),
                    resource=resource,
                )
            )
            registrations[name] = registration
            context.require(s.TOOLS).register(context, name, registration)
        context.require(s.CONTEXT_PREPARERS).register(
            context,
            "skills",
            partial(prepare_skill_context, registration=registrations["skill"]),
        )
