"""Immutable runtime instructions owned by one registration."""

from kunyu.agent.skills.definitions import (
    SkillDefinition,
    SkillRegistration,
    SkillSummary,
    validate_skill_text,
)

RUNTIME_RANK = 250


class RuntimeSkillProvider:
    def __init__(self, registration: SkillRegistration) -> None:
        validate_skill_text(registration.content)
        if not registration.content.strip():
            raise ValueError("Runtime skill instructions must not be empty.")
        self.definition = SkillDefinition(
            SkillSummary(
                name=registration.name,
                description=registration.description,
                source=registration.source,
                provider="runtime",
                locator=registration.name,
                rank=RUNTIME_RANK,
                resource_base=registration.resource_base,
                model_invocable=registration.model_invocable,
                user_invocable=registration.user_invocable,
                when_to_use=registration.when_to_use,
            ),
            registration.content,
        )

    async def list(self, *, workspace_id: str) -> tuple[SkillSummary, ...]:
        return (self.definition.summary,)

    async def get(self, summary: SkillSummary, *, workspace_id: str) -> SkillDefinition:
        self._require(summary)
        return self.definition

    def _require(self, summary: SkillSummary) -> None:
        if summary != self.definition.summary:
            raise ValueError("Runtime skill metadata changed before loading.")
