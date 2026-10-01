"""Optional service definition; providers and invocation tools mount separately."""

from kunyu.agent import services as s
from kunyu.agent.scope import Context
from kunyu.agent.skills.registry import SkillRegistry


class SkillPlugin:
    name = "skills"
    requires = ()
    provides = (s.SKILLS,)

    async def apply(self, context: Context) -> None:
        context.provide(s.SKILLS, SkillRegistry())
