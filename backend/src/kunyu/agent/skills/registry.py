"""Scoped provider catalogs and explicit loading of one selected Skill."""

import re
from dataclasses import dataclass
from typing import Literal, Protocol

from kunyu.agent.scope import Context, ScopedEntries

SKILL_NAME_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


def validate_skill_name(name: str) -> None:
    if re.fullmatch(SKILL_NAME_PATTERN, name) is None:
        raise ValueError("Skill names must use lowercase letters, digits and hyphens.")


@dataclass(frozen=True, slots=True)
class SkillSummary:
    name: str
    description: str
    source: str
    locator: str
    rank: int
    resource_base: str
    model_invocable: bool = True
    user_invocable: bool = True


@dataclass(frozen=True, slots=True)
class SkillDefinition:
    summary: SkillSummary
    content: str


class SkillProvider(Protocol):
    async def list(self, *, workspace_id: str) -> tuple[SkillSummary, ...]: ...

    async def get(
        self, summary: SkillSummary, *, workspace_id: str
    ) -> SkillDefinition: ...


@dataclass(frozen=True, slots=True)
class _Candidate:
    summary: SkillSummary
    provider: SkillProvider


class SkillRegistry:
    def __init__(self) -> None:
        self._providers: ScopedEntries[SkillProvider] = ScopedEntries()

    def register(self, owner: Context, name: str, provider: SkillProvider) -> None:
        self._providers.register(owner, name, provider)

    async def _catalog(
        self, context: Context, workspace_id: str
    ) -> dict[str, _Candidate]:
        catalog: dict[str, _Candidate] = {}
        for layer in self._providers.layers(context):
            candidates: dict[str, _Candidate] = {}
            for provider in layer.values():
                for summary in await provider.list(workspace_id=workspace_id):
                    context.assert_active()
                    validate_skill_name(summary.name)
                    if not summary.description or not summary.locator:
                        raise ValueError(
                            "Skill metadata must contain name, description and locator."
                        )
                    previous = candidates.get(summary.name)
                    if previous is None or summary.rank < previous.summary.rank:
                        candidates[summary.name] = _Candidate(summary, provider)
            catalog.update(candidates)
        return catalog

    async def list(
        self,
        context: Context,
        *,
        workspace_id: str,
        invocation: Literal["model", "user"] | None = None,
    ) -> tuple[SkillSummary, ...]:
        catalog = await self._catalog(context, workspace_id)
        return tuple(
            candidate.summary
            for _, candidate in sorted(catalog.items())
            if invocation is None or _invocable(candidate.summary, invocation)
        )

    async def get(
        self,
        context: Context,
        name: str,
        *,
        workspace_id: str,
        invocation: Literal["model", "user"] | None = None,
    ) -> SkillDefinition:
        validate_skill_name(name)
        candidate = (await self._catalog(context, workspace_id)).get(name)
        if candidate is None or (
            invocation is not None and not _invocable(candidate.summary, invocation)
        ):
            raise LookupError(
                f"Skill '{name}' is unavailable for {invocation} invocation."
            )
        definition = await candidate.provider.get(
            candidate.summary, workspace_id=workspace_id
        )
        context.assert_active()
        if (
            definition.summary != candidate.summary
            or (
                invocation is not None
                and not _invocable(definition.summary, invocation)
            )
            or not definition.content.strip()
        ):
            raise ValueError(f"Skill '{name}' body does not match its catalog entry.")
        return definition


def _invocable(summary: SkillSummary, invocation: Literal["model", "user"]) -> bool:
    if invocation == "model":
        return summary.model_invocable
    if invocation == "user":
        return summary.user_invocable
    raise ValueError(f"Unknown Skill invocation '{invocation}'.")
