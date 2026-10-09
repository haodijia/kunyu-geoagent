"""The product installs provider capabilities independently from its LLM service."""

from kunyu.agent import services as s
from kunyu.agent.model_providers import (
    ModelProviderRegistry,
    SDKProvider,
    is_official_deepseek,
)
from kunyu.agent.scope import Context


class ModelProvidersPlugin:
    name = "llm-providers"
    requires = ()
    provides = (s.MODEL_PROVIDERS,)

    async def apply(self, context: Context) -> None:
        context.provide(s.MODEL_PROVIDERS, ModelProviderRegistry())


class DeepSeekModelProviderPlugin:
    name = "llm-deepseek"
    requires = (s.MODEL_PROVIDERS,)
    provides = ()

    async def apply(self, context: Context) -> None:
        context.require(s.MODEL_PROVIDERS).register(
            context, SDKProvider("deepseek-official", is_official_deepseek, 0)
        )


class SDKModelProviderPlugin:
    name = "llm-sdk"
    requires = (s.MODEL_PROVIDERS,)
    provides = ()

    async def apply(self, context: Context) -> None:
        context.require(s.MODEL_PROVIDERS).register(
            context,
            SDKProvider("sdk", lambda config: not is_official_deepseek(config), 100),
        )
