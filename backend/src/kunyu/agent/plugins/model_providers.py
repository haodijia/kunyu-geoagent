"""The product installs provider capabilities independently from its LLM service."""

from kunyu.agent.capabilities.model_providers import (
    ModelProvider,
    ModelProviderRegistry,
    is_official_deepseek,
)
from kunyu.agent.core import services as s
from kunyu.agent.core.scope import Context
from kunyu.integrations.model.sdk import PreparedSDKModel
from kunyu.integrations.model.sdk_discovery import (
    discover_deepseek_models,
    discover_sdk_models,
)


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
            context,
            ModelProvider(
                "deepseek-official",
                is_official_deepseek,
                0,
                PreparedSDKModel,
                discover_deepseek_models,
            ),
        )


class SDKModelProviderPlugin:
    name = "llm-sdk"
    requires = (s.MODEL_PROVIDERS,)
    provides = ()

    async def apply(self, context: Context) -> None:
        context.require(s.MODEL_PROVIDERS).register(
            context,
            ModelProvider(
                "sdk",
                lambda config: not is_official_deepseek(config),
                100,
                PreparedSDKModel,
                discover_sdk_models,
            ),
        )
