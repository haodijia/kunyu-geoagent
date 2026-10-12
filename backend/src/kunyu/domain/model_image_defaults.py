"""Advisory image defaults for exact model IDs documented by each provider.

Applied only when creating a catalog entry; saved user settings stay authoritative.
Sources and scope are recorded in docs/develop/模型图片输入.md.
"""

from kunyu.domain.model_connections import ModelProviderType
from kunyu.domain.model_images import ModelImageInput

IMAGE_MODELS = {
    ModelProviderType.DEEPSEEK: frozenset({"deepseek-flash"}),
    ModelProviderType.MOONSHOT: frozenset(
        {
            "kimi-k2.5",
            "kimi-k2.6",
            "kimi-k2.7-code",
            "kimi-k2.7-code-highspeed",
            "kimi-k3",
        }
    ),
    ModelProviderType.MIMO: frozenset(
        {
            "mimo-v2.5",
            "mimo-v2.6-flash",
            "mimo-v2.6-pro",
            "mimo-v2.6-pro-ultraspeed",
        }
    ),
    ModelProviderType.ZAI: frozenset(
        {
            "glm-5v-turbo",
            "glm-4.6v",
            "glm-4.6v-flashx",
            "glm-4.6v-flash",
            "glm-4.1v-thinking-flashx",
            "glm-4.1v-thinking-flash",
            "glm-4v-flash",
        }
    ),
    ModelProviderType.OPENAI: frozenset(
        {
            "gpt-6-astra",
            "gpt-5.6-sol",
            "gpt-5.6-terra",
            "gpt-5.6-luna",
            "gpt-5.5",
            "gpt-5.4",
            "gpt-5.4-mini",
            "gpt-5.4-nano",
            "gpt-5.2",
            "gpt-5.1",
            "gpt-5",
            "gpt-5-mini",
            "gpt-5-nano",
            "gpt-4.1",
            "gpt-4.1-mini",
            "gpt-4.1-nano",
            "gpt-4o",
            "gpt-4o-mini",
            "o1",
            "o1-pro",
            "o3",
            "o4-mini",
        }
    ),
}


def default_image_input(provider: ModelProviderType, model_id: str) -> ModelImageInput:
    enabled = provider in IMAGE_MODELS and model_id in IMAGE_MODELS[provider]
    return ModelImageInput(enabled=enabled)
