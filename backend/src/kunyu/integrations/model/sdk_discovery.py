"""Provider-owned catalog routes over SDK clients."""

from dataclasses import replace
from urllib.parse import urlsplit, urlunsplit

import httpx

from kunyu.domain.model_connections import ModelProtocol
from kunyu.integrations.model.connection import ModelConnectionConfig
from kunyu.integrations.model.sdk import PreparedSDKModel


async def discover_sdk_models(
    client: httpx.AsyncClient, config: ModelConnectionConfig, api_key: str | None
) -> dict:
    async with PreparedSDKModel(client, config, "catalog", api_key) as prepared:
        return await prepared.models()


async def discover_deepseek_models(
    client: httpx.AsyncClient, config: ModelConnectionConfig, api_key: str | None
) -> dict:
    parsed = urlsplit(config.base_url)
    if parsed.hostname == "api.deepseek.com":
        config = replace(
            config,
            protocol=ModelProtocol.OPENAI_COMPATIBLE,
            base_url=urlunsplit((parsed.scheme, parsed.netloc, "", "", "")),
        )
    return await discover_sdk_models(client, config, api_key)
