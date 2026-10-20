"""Skill service, filesystem provider and consumer mount independently."""

from functools import partial
from pathlib import Path

from kunyu.agent.core import services as s
from kunyu.agent.core.scope import Context
from kunyu.agent.skills.context import prepare_skill_context
from kunyu.agent.skills.filesystem import FilesystemSkillProvider
from kunyu.agent.skills.registry import SkillRegistry
from kunyu.agent.tools.context.skills import SkillTool
from kunyu.agent.tools.registry import ToolRegistration


class SkillPlugin:
    name = "skills"
    requires = ()
    provides = (s.SKILLS,)

    async def apply(self, context: Context) -> None:
        context.provide(s.SKILLS, SkillRegistry())


class FilesystemSkillsPlugin:
    name = "skills-filesystem"
    requires = (s.SKILLS, s.DATABASE)
    provides = ()

    async def apply(self, context: Context) -> None:
        context.require(s.SKILLS).register_provider(
            context,
            "filesystem",
            FilesystemSkillProvider(
                context.require(s.DATABASE).path.parent,
                Path(__file__).parent / "bundled",
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
        s.SUBAGENTS,
    )
    provides = ()

    def __init__(self, *, catalog_description_max_length: int = 500) -> None:
        if (
            type(catalog_description_max_length) is not int
            or catalog_description_max_length < 3
        ):
            raise ValueError(
                "Catalog description length must be an integer of at least 3."
            )
        self.catalog_description_max_length = catalog_description_max_length

    async def apply(self, context: Context) -> None:
        registration = ToolRegistration(
            partial(
                SkillTool,
                contexts=context.require(s.CONTEXTS),
                skills=context.require(s.SKILLS),
                scopes=context.require(s.SCOPES),
            )
        )
        context.require(s.TOOLS).register(context, "skill", registration)
        context.require(s.CONTEXT_PREPARERS).register(
            context,
            "skills",
            partial(
                prepare_skill_context,
                registration=registration,
                catalog_description_max_length=self.catalog_description_max_length,
            ),
        )
