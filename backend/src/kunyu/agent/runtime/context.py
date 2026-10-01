"""Model context contracts and ordered system-prompt sections."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from kunyu.agent.runtime.models import ModelMessage


@dataclass(frozen=True)
class AgentContext:
    messages: tuple[ModelMessage, ...]


class ContextProvider(Protocol):
    async def build(self, run_id: str) -> AgentContext: ...


@dataclass(frozen=True, slots=True)
class PromptSection:
    name: str
    order: int
    render: Callable[[object], str]


class PromptSectionRegistry:
    """Code-registered, deterministically ordered system-prompt sections."""

    def __init__(self) -> None:
        self._sections: dict[str, PromptSection] = {}

    def register(self, section: PromptSection) -> None:
        if not section.name:
            raise ValueError("Prompt section names must not be empty.")
        if section.name in self._sections:
            raise ValueError(f"Prompt section '{section.name}' is already registered.")
        self._sections[section.name] = section

    def render(self, source: object) -> str:
        sections = sorted(
            self._sections.values(),
            key=lambda section: (section.order, section.name),
        )
        return "\n\n".join(
            content
            for section in sections
            if (content := section.render(source)).strip()
        )
