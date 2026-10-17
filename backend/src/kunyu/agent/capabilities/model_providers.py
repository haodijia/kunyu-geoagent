"""Provider contributions behind the shared LLM service."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

import httpx

from kunyu.agent.core.scope import Context, ScopedEntries
from kunyu.agent.runtime.contracts.models import (
    ModelAdapterError,
    ModelErrorCode,
    ModelOutput,
    ModelRequest,
)
from kunyu.domain.models.model_connections import ModelProtocol, ModelProviderType
from kunyu.integrations.model.connection import ModelConnectionConfig

if TYPE_CHECKING:
    from kunyu.integrations.model.sdk import PreparedSDKModel


class LLMService(Protocol):
    def stream(
        self, request: ModelRequest[ModelConnectionConfig]
    ) -> AsyncIterator[ModelOutput]: ...
    def check_stream(
        self, request: ModelRequest[ModelConnectionConfig], api_key: str | None
    ) -> AsyncIterator[ModelOutput]: ...
    async def models(
        self, config: ModelConnectionConfig, api_key: str | None
    ) -> dict: ...


@dataclass(frozen=True, slots=True)
class ModelProvider:
    name: str
    matches: Callable[[ModelConnectionConfig], bool]
    rank: int
    prepare: Callable[
        [httpx.AsyncClient, ModelConnectionConfig, str, str | None], PreparedSDKModel
    ]
    models: Callable[
        [httpx.AsyncClient, ModelConnectionConfig, str | None], Awaitable[dict]
    ]


@dataclass(frozen=True, slots=True)
class ProviderRegistration:
    owner: Context
    provider: ModelProvider


class ModelProviderRegistry:
    def __init__(self) -> None:
        self.entries: ScopedEntries[ProviderRegistration] = ScopedEntries()

    def register(self, owner: Context, provider: ModelProvider) -> Callable[[], None]:
        return self.entries.register(
            owner, provider.name, ProviderRegistration(owner, provider)
        )

    def require(
        self, context: Context, config: ModelConnectionConfig
    ) -> ProviderRegistration:
        for layer in reversed(self.entries.layers(context)):
            matches = [
                entry for entry in layer.values() if entry.provider.matches(config)
            ]
            if matches:
                return min(matches, key=lambda entry: entry.provider.rank)
        raise ModelAdapterError(
            ModelErrorCode.UNSUPPORTED_CAPABILITY,
            "No installed model provider serves this route.",
        )


def is_official_deepseek(config: ModelConnectionConfig) -> bool:
    return (
        config.provider_type is ModelProviderType.DEEPSEEK
        and config.protocol is ModelProtocol.DEEPSEEK_MESSAGES
    )
