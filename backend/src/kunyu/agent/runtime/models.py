"""Model input, streaming output, and failure contracts."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from kunyu.agent.runtime.content import ContentBlock, ContentBlockType, ReplayEnvelope
from kunyu.agent.runtime.tools import ToolSpec


class ModelRole(StrEnum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


class ModelFinishReason(StrEnum):
    STOP = "stop"
    TOOL_CALLS = "tool_calls"
    LENGTH = "length"
    CONTENT_FILTER = "content_filter"


class ModelErrorCode(StrEnum):
    INVALID_REQUEST = "MODEL_INVALID_REQUEST"
    UNSUPPORTED_CAPABILITY = "UNSUPPORTED_CAPABILITY"
    CREDENTIAL_UNAVAILABLE = "CREDENTIAL_STORE_UNAVAILABLE"
    PROVIDER_AUTH = "PROVIDER_AUTH"
    PROVIDER_PROTOCOL = "PROVIDER_PROTOCOL"
    PROVIDER_NETWORK = "PROVIDER_NETWORK"
    PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT"
    EMPTY_RESPONSE = "MODEL_EMPTY_RESPONSE"
    PROVIDER_RATE_LIMIT = "PROVIDER_RATE_LIMIT"
    PROVIDER_SERVER = "PROVIDER_SERVER"


class ModelAdapterError(RuntimeError):
    """Stable, redacted failure raised by a model adapter."""

    def __init__(
        self,
        code: ModelErrorCode,
        message: str,
        *,
        provider_retry_after_ms: float | None = None,
    ) -> None:
        self.code = code
        self.provider_retry_after_ms = provider_retry_after_ms
        super().__init__(message)


@dataclass(frozen=True, slots=True)
class BlockStart:
    index: int
    block_type: ContentBlockType


@dataclass(frozen=True, slots=True)
class BlockEnd:
    index: int
    block: ContentBlock


@dataclass(frozen=True, slots=True)
class ModelToolCallDelta:
    index: int
    call_id: str
    name: str | None
    arguments_delta: str


@dataclass(frozen=True, slots=True)
class ModelMessage:
    role: ModelRole
    content: tuple[ContentBlock, ...]
    tool_call_id: str | None = None
    context_source: str | None = None
    replay_state: ReplayEnvelope | None = None


@dataclass(frozen=True, slots=True)
class ModelRequest[AdapterConfigT]:
    run_id: str
    adapter_config: AdapterConfigT
    model_id: str
    messages: tuple[ModelMessage, ...]
    tools: tuple[ToolSpec, ...]
    max_output_tokens: int
    reasoning_effort: str | None = None


@dataclass(frozen=True, slots=True)
class TextDelta:
    index: int
    text: str


@dataclass(frozen=True, slots=True)
class ReasoningDelta:
    index: int
    text: str


@dataclass(frozen=True, slots=True)
class TokenUsage:
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


@dataclass(frozen=True, slots=True)
class ModelFinish:
    reason: ModelFinishReason
    replay_state: ReplayEnvelope | None = None


type ModelOutput = (
    TextDelta
    | ReasoningDelta
    | ModelToolCallDelta
    | BlockStart
    | BlockEnd
    | TokenUsage
    | ModelFinish
)


class ModelAdapter[AdapterConfigT](Protocol):
    def stream(
        self, request: ModelRequest[AdapterConfigT]
    ) -> AsyncIterator[ModelOutput]: ...
