"""Model context contracts and ordered system-prompt sections."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Protocol

from kunyu.agent.runtime.models import ModelMessage
from kunyu.agent.scope import Context, ScopedEntries


@dataclass(frozen=True)
class AgentContext:
    messages: tuple[ModelMessage, ...]


class ContextProvider(Protocol):
    async def build(self, run_id: str) -> AgentContext: ...


class ContextPreparationRegistry:
    """Scoped pre-step contributors persist context before history is assembled."""

    def __init__(self) -> None:
        self._entries: ScopedEntries[Callable[[str, Context], Awaitable[None]]] = (
            ScopedEntries()
        )

    def register(
        self,
        owner: Context,
        name: str,
        prepare: Callable[[str, Context], Awaitable[None]],
    ) -> None:
        self._entries.register(owner, name, prepare)

    async def prepare(self, run_id: str, context: Context) -> None:
        for prepare in self._entries.view(context).values():
            await prepare(run_id, context)
            context.assert_active()


@dataclass(frozen=True, slots=True)
class PromptSection:
    name: str
    order: int
    render: Callable[[object], str]


class PromptSectionRegistry:
    """Code-registered, deterministically ordered system-prompt sections."""

    def __init__(self) -> None:
        self._sections: ScopedEntries[PromptSection] = ScopedEntries()

    def register(self, owner: Context, section: PromptSection) -> None:
        self._sections.register(owner, section.name, section)

    def render(self, source: object, context: Context) -> str:
        sections = sorted(
            self._sections.view(context).values(),
            key=lambda section: (section.order, section.name),
        )
        return "\n\n".join(
            content
            for section in sections
            if (content := section.render(source)).strip()
        )
