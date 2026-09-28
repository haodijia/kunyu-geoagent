"""Model input and streaming output contracts."""

from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass
from typing import Literal, Protocol

from dsh.tools import ToolSpec


@dataclass(frozen=True)
class ModelToolCall:
    """A complete call assembled from provider stream fragments."""

    call_id: str
    name: str
    arguments: Mapping[str, object]


@dataclass(frozen=True)
class ModelMessage:
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    tool_call_id: str | None = None
    tool_calls: tuple[ModelToolCall, ...] = ()


@dataclass(frozen=True)
class ModelRequest:
    run_id: str
    model_id: str
    messages: tuple[ModelMessage, ...]
    tools: tuple[ToolSpec, ...]
    reasoning_effort: str | None = None


@dataclass(frozen=True)
class TextDelta:
    text: str


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int | None = None
    output_tokens: int | None = None


type ModelOutput = TextDelta | ModelToolCall | TokenUsage


class ModelAdapter(Protocol):
    def stream(self, request: ModelRequest) -> AsyncIterator[ModelOutput]: ...
