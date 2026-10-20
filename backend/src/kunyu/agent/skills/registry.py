"""Scoped providers, runtime contributions and instruction loading."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Literal, Protocol

from kunyu.agent.core.scope import Context, ScopedEntries, ScopeKey
from kunyu.agent.skills.definitions import (
    DirectoryResourceBase,
    OpaqueResourceBase,
    SkillDefinition,
    SkillRegistration,
    SkillSummary,
    UrlResourceBase,
    validate_skill_name,
    validate_skill_text,
)
from kunyu.agent.skills.runtime import RuntimeSkillProvider

logger = logging.getLogger(__name__)


class SkillProvider(Protocol):
    async def list(self, *, workspace_id: str) -> tuple[SkillSummary, ...]: ...
    async def get(
        self, summary: SkillSummary, *, workspace_id: str
    ) -> SkillDefinition: ...


class SkillCatalogChangedError(RuntimeError):
    pass


class _ProviderRegistration:
    def __init__(
        self, owner: Context, name: str, provider: SkillProvider, *, runtime: bool
    ) -> None:
        self.owner, self.name, self.provider, self.runtime = (
            owner,
            name,
            provider,
            runtime,
        )
        self.active = True
        self.pending: set[asyncio.Task] = set()
        self.detach: Callable[[], None] | None = None

    async def call[T](self, action: Callable[[], Awaitable[T]]) -> T:
        self.require_active()
        task = asyncio.create_task(action(), name=f"skill:{self.name}")
        self.pending.add(task)
        try:
            result = await task
            if asyncio.current_task().cancelling():
                raise asyncio.CancelledError
            self.require_active()
            return result
        except asyncio.CancelledError:
            if not self.active and not asyncio.current_task().cancelling():
                raise LookupError(
                    f"Skill provider '{self.name}' was disposed."
                ) from None
            raise
        except Exception:
            logger.exception("Skill provider operation failed provider=%s", self.name)
            raise
        finally:
            self.pending.discard(task)
            if not self.active and not self.pending and self.detach is not None:
                self.detach()

    def require_active(self) -> None:
        if not self.active:
            raise LookupError(f"Skill provider '{self.name}' was disposed.")
        self.owner.assert_active()

    def dispose(self) -> None:
        self.active = False
        for task in self.pending:
            task.cancel()
        if not self.pending and self.detach is not None:
            self.detach()

    async def close(self) -> None:
        pending = tuple(self.pending)
        self.dispose()
        await asyncio.gather(*pending, return_exceptions=True)


@dataclass(frozen=True, slots=True)
class _Candidate:
    summary: SkillSummary
    entry: _ProviderRegistration
    layers: tuple[dict[str, _ProviderRegistration], ...]


class SkillRegistry:
    def __init__(self) -> None:
        self._entries: ScopedEntries[_ProviderRegistration] = ScopedEntries()
        self._runtime_names: dict[ScopeKey, set[str]] = {}

    def register_provider(
        self, owner: Context, name: str, provider: SkillProvider
    ) -> Callable[[], None]:
        if not name or name == "runtime":
            raise ValueError(
                "Skill provider names must be nonempty; 'runtime' is reserved."
            )
        return self._register(owner, f"provider:{name}", name, provider, runtime=False)

    def register(
        self, owner: Context, registration: SkillRegistration
    ) -> Callable[[], None]:
        owner.assert_active()
        provider = RuntimeSkillProvider(registration)
        self._validate(provider.definition.summary, "runtime")
        names = self._runtime_names.setdefault(owner.scope, set())
        if registration.name in names:
            logger.warning(
                "Runtime skill ignored because it is already registered name=%s",
                registration.name,
            )
            return lambda: None
        dispose = self._register(
            owner, f"runtime:{registration.name}", "runtime", provider, runtime=True
        )
        names.add(registration.name)
        active = True

        def remove() -> None:
            nonlocal active
            if not active:
                return
            active = False
            dispose()
            names.remove(registration.name)
            if not names:
                del self._runtime_names[owner.scope]
            detach()

        detach = owner.effect(remove)
        return remove

    def _register(
        self, owner, key, name, provider, *, runtime: bool
    ) -> Callable[[], None]:
        entry = _ProviderRegistration(owner, name, provider, runtime=runtime)
        unregister = self._entries.register(owner, key, entry)
        entry.detach = owner.effect(entry.close)

        def remove() -> None:
            if entry.active:
                unregister()
                entry.dispose()
                detach()

        detach = owner.effect(remove)
        return remove

    async def _catalog(
        self, context: Context, workspace_id: str
    ) -> dict[str, _Candidate]:
        layers = self._entries.layers(context)
        catalog: dict[str, _Candidate] = {}
        for layer in layers:
            candidates: dict[str, _Candidate] = {}
            for entry in sorted(layer.values(), key=lambda value: not value.runtime):
                summaries = await entry.call(
                    lambda entry=entry: entry.provider.list(workspace_id=workspace_id)
                )
                for summary in summaries:
                    context.assert_active()
                    self._validate(summary, entry.name)
                    previous = candidates.get(summary.name)
                    if previous is None or summary.rank < previous.summary.rank:
                        candidates[summary.name] = _Candidate(summary, entry, layers)
            catalog.update(candidates)
        if layers != self._entries.layers(context):
            raise SkillCatalogChangedError(
                "Skill registrations changed during discovery; request a new catalog."
            )
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

    async def _select(
        self,
        context: Context,
        name: str,
        workspace_id: str,
        invocation: Literal["model", "user"] | None,
    ) -> _Candidate:
        validate_skill_name(name)
        candidate = (await self._catalog(context, workspace_id)).get(name)
        if candidate is None or (
            invocation is not None and not _invocable(candidate.summary, invocation)
        ):
            raise LookupError(
                f"Skill '{name}' is unavailable for {invocation} invocation."
            )
        return candidate

    async def _load(
        self, context: Context, candidate: _Candidate, workspace_id: str
    ) -> SkillDefinition:
        definition = await candidate.entry.call(
            lambda: candidate.entry.provider.get(
                candidate.summary, workspace_id=workspace_id
            )
        )
        context.assert_active()
        self._require_catalog(context, candidate)
        validate_skill_text(definition.content)
        if definition.summary != candidate.summary or not definition.content.strip():
            raise ValueError(
                f"Skill '{candidate.summary.name}' body does not match its catalog entry."
            )
        return definition

    async def get(
        self,
        context: Context,
        name: str,
        *,
        workspace_id: str,
        invocation: Literal["model", "user"] | None = None,
    ) -> SkillDefinition:
        candidate = await self._select(context, name, workspace_id, invocation)
        return await self._load(context, candidate, workspace_id)

    def _require_catalog(self, context: Context, candidate: _Candidate) -> None:
        if candidate.layers != self._entries.layers(context):
            raise SkillCatalogChangedError(
                "Skill registrations changed while loading; request the current skill."
            )

    @staticmethod
    def _validate(summary: SkillSummary, provider: str) -> None:
        validate_skill_name(summary.name)
        if (
            not isinstance(summary.description, str)
            or not summary.description.strip()
            or len(summary.description) > 2000
            or not isinstance(summary.source, str)
            or not summary.source
            or summary.provider != provider
            or type(summary.rank) is not int
            or type(summary.model_invocable) is not bool
            or type(summary.user_invocable) is not bool
            or (
                summary.resource_base is not None
                and not isinstance(
                    summary.resource_base,
                    (DirectoryResourceBase, UrlResourceBase, OpaqueResourceBase),
                )
            )
            or (summary.path is not None and not isinstance(summary.path, str))
            or (
                summary.when_to_use is not None
                and (
                    not isinstance(summary.when_to_use, str)
                    or not summary.when_to_use.strip()
                    or len(summary.when_to_use) > 2000
                )
            )
        ):
            raise ValueError(f"Skill '{summary.name}' has invalid provider metadata.")
        summary.description.encode("utf-8")
        if summary.when_to_use is not None:
            summary.when_to_use.encode("utf-8")


def _invocable(summary: SkillSummary, invocation: Literal["model", "user"]) -> bool:
    if invocation == "model":
        return summary.model_invocable
    if invocation == "user":
        return summary.user_invocable
    raise ValueError(f"Unknown Skill invocation '{invocation}'.")
