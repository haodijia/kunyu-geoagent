"""Immutable runtime instructions and text resources owned by one registration."""

from types import MappingProxyType

from kunyu.agent.skills.definitions import (
    SkillDefinition,
    SkillRegistration,
    SkillSummary,
    validate_resource_path,
    validate_skill_text,
)

RUNTIME_RANK = 250


class RuntimeSkillProvider:
    def __init__(self, registration: SkillRegistration) -> None:
        validate_skill_text(registration.content)
        if not registration.content.strip():
            raise ValueError("Runtime skill instructions must not be empty.")
        resources = dict(registration.resources)
        for path, content in resources.items():
            validate_resource_path(path)
            validate_skill_text(content)
        self.resources = MappingProxyType(resources)
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

    async def read_resource(
        self, summary: SkillSummary, path: str, *, workspace_id: str
    ) -> str:
        self._require(summary)
        validate_resource_path(path)
        if path not in self.resources:
            raise LookupError(f"Runtime skill resource '{path}' does not exist.")
        return self.resources[path]

    def _require(self, summary: SkillSummary) -> None:
        if summary != self.definition.summary:
            raise ValueError("Runtime skill metadata changed before loading.")
