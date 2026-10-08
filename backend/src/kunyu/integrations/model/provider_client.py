import asyncio
import json
from contextlib import aclosing
from dataclasses import dataclass
from enum import StrEnum
from time import monotonic
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from kunyu.agent.runtime.content import TextBlock, ToolCallBlock
from kunyu.agent.runtime.models import (
    BlockEnd,
    ModelAdapterError,
    ModelErrorCode,
    ModelFinish,
    ModelFinishReason,
    ModelMessage,
    ModelRequest,
    ModelRole,
)
from kunyu.agent.runtime.tools import ToolSchema
from kunyu.domain.model_connections import (
    MaxTokensField,
    ModelAuthMode,
    ModelProtocol,
    ModelProviderType,
)
from kunyu.domain.model_reasoning import ReasoningParameters
from kunyu.integrations.model.adapter import SDKModelAdapter
from kunyu.integrations.model.connection import ModelConnectionConfig
from kunyu.integrations.model.sdk import ProviderSDK

MODEL_OPERATION_TIMEOUT_SECONDS = 30
MAX_CATALOG_ENTRIES = 2_000
MAX_MODEL_ID_LENGTH = 256
PROBE_TOOL_NAME = "kunyu_capability_probe"
PROBE_TOKEN = "kunyu-tool-check"


class ProviderErrorCode(StrEnum):
    AUTH = "PROVIDER_AUTH"
    PROTOCOL = "PROVIDER_PROTOCOL"
    NETWORK = "PROVIDER_NETWORK"
    TIMEOUT = "PROVIDER_TIMEOUT"


class ProviderRequestError(RuntimeError):
    def __init__(self, code: ProviderErrorCode, message: str) -> None:
        self.code = code
        super().__init__(message)


@dataclass(frozen=True, slots=True)
class ProviderConfig:
    protocol: ModelProtocol
    provider_type: ModelProviderType
    base_url: str
    auth_mode: ModelAuthMode
    api_key: str | None
    max_tokens_field: MaxTokensField
    include_usage: bool


@dataclass(frozen=True, slots=True)
class DiscoveredModel:
    model_id: str
    display_name: str | None
    reasoning_efforts: tuple[str, ...] = ()
    reasoning_default: str | None = None


@dataclass(frozen=True, slots=True)
class ModelCheckOutcome:
    text_passed: bool
    tool_passed: bool | None
    error_code: ProviderErrorCode | None
    latency_ms: int


class ModelProviderClient:
    def __init__(self, client: httpx.AsyncClient) -> None:
        if client.follow_redirects:
            raise ValueError("The model HTTP client must not follow redirects.")
        self._client = client

    async def discover_models(
        self, config: ProviderConfig
    ) -> tuple[DiscoveredModel, ...]:
        protocol, base_url = _catalog_route(config)
        if config.auth_mode is ModelAuthMode.API_KEY and not config.api_key:
            raise ProviderRequestError(
                ProviderErrorCode.AUTH, "The model credential is missing."
            )
        key = config.api_key if config.auth_mode is ModelAuthMode.API_KEY else None
        try:
            async with asyncio.timeout(MODEL_OPERATION_TIMEOUT_SECONDS):
                payload = await ProviderSDK(
                    self._client, protocol, base_url, key
                ).models()
        except ModelAdapterError as error:
            raise _provider_error(error) from error
        except TimeoutError as error:
            raise ProviderRequestError(
                ProviderErrorCode.TIMEOUT, "The provider request timed out."
            ) from error
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise _protocol_error("The provider returned an invalid model list.")
        raw_models = payload["data"]
        if not raw_models:
            raise _protocol_error("The provider returned no usable models.")
        if len(raw_models) > MAX_CATALOG_ENTRIES:
            raise _protocol_error("The provider returned too many models.")

        models: list[DiscoveredModel] = []
        seen: set[str] = set()
        for item in raw_models:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                raise _protocol_error("The provider returned an invalid model entry.")
            model_id = item["id"].strip()
            if not model_id or len(model_id) > MAX_MODEL_ID_LENGTH:
                raise _protocol_error("The provider returned an invalid model ID.")
            if model_id in seen:
                continue
            seen.add(model_id)
            efforts, default = _reasoning_metadata(item)
            models.append(
                DiscoveredModel(
                    model_id=model_id,
                    display_name=_optional_display_name(item),
                    reasoning_efforts=efforts,
                    reasoning_default=default,
                )
            )
        if not models:
            raise _protocol_error("The provider returned no usable models.")
        return tuple(models)

    async def check_text(
        self,
        config: ProviderConfig,
        model_id: str,
        max_output_tokens: int,
        parameters: ReasoningParameters,
    ) -> ModelCheckOutcome:
        started_at = monotonic()
        try:
            async with asyncio.timeout(MODEL_OPERATION_TIMEOUT_SECONDS):
                await self._probe(
                    config, model_id, max_output_tokens, parameters, tool=False
                )
        except TimeoutError:
            return ModelCheckOutcome(
                text_passed=False,
                tool_passed=None,
                error_code=ProviderErrorCode.TIMEOUT,
                latency_ms=_elapsed_ms(started_at),
            )
        except ProviderRequestError as error:
            return ModelCheckOutcome(
                text_passed=False,
                tool_passed=None,
                error_code=error.code,
                latency_ms=_elapsed_ms(started_at),
            )
        return ModelCheckOutcome(
            text_passed=True,
            tool_passed=None,
            error_code=None,
            latency_ms=_elapsed_ms(started_at),
        )

    async def check_tools(
        self,
        config: ProviderConfig,
        model_id: str,
        max_output_tokens: int,
        parameters: ReasoningParameters,
    ) -> ModelCheckOutcome:
        started_at = monotonic()
        text_passed = False
        try:
            async with asyncio.timeout(MODEL_OPERATION_TIMEOUT_SECONDS):
                await self._probe(
                    config, model_id, max_output_tokens, parameters, tool=False
                )
                text_passed = True
                await self._probe(
                    config, model_id, max_output_tokens, parameters, tool=True
                )
        except TimeoutError:
            return ModelCheckOutcome(
                text_passed=text_passed,
                tool_passed=False if text_passed else None,
                error_code=ProviderErrorCode.TIMEOUT,
                latency_ms=_elapsed_ms(started_at),
            )
        except ProviderRequestError as error:
            return ModelCheckOutcome(
                text_passed=text_passed,
                tool_passed=False if text_passed else None,
                error_code=error.code,
                latency_ms=_elapsed_ms(started_at),
            )
        return ModelCheckOutcome(
            text_passed=True,
            tool_passed=True,
            error_code=None,
            latency_ms=_elapsed_ms(started_at),
        )

    async def _probe(
        self,
        config: ProviderConfig,
        model_id: str,
        max_output_tokens: int,
        parameters: ReasoningParameters,
        *,
        tool: bool,
    ) -> None:
        async def credential(connection_id: str, revision: int) -> str | None:
            return config.api_key

        adapter = SDKModelAdapter(self._client, credential_resolver=credential)
        request = ModelRequest(
            run_id="capability-check",
            adapter_config=ModelConnectionConfig(
                protocol=config.protocol,
                connection_id="capability-check",
                config_revision=1,
                base_url=config.base_url,
                auth_mode=config.auth_mode,
                max_tokens_field=config.max_tokens_field,
                include_usage=config.include_usage,
                provider_type=config.provider_type,
                reasoning_parameters=parameters,
            ),
            model_id=model_id,
            max_output_tokens=max_output_tokens,
            messages=(
                ModelMessage(
                    role=ModelRole.USER,
                    content=(
                        TextBlock(
                            text=(
                                f"Call {PROBE_TOOL_NAME} with token '{PROBE_TOKEN}'."
                                if tool
                                else "Reply with a short plain-text acknowledgement."
                            )
                        ),
                    ),
                ),
            ),
            tools=(
                ToolSchema(
                    name=PROBE_TOOL_NAME,
                    description="Checks structured tool-call support.",
                    parameters={
                        "type": "object",
                        "properties": {
                            "token": {"type": "string", "const": PROBE_TOKEN}
                        },
                        "required": ["token"],
                        "additionalProperties": False,
                    },
                ),
            )
            if tool
            else (),
        )
        blocks = []
        finish = None
        try:
            async with aclosing(adapter.stream(request)) as outputs:
                async for output in outputs:
                    if isinstance(output, BlockEnd):
                        blocks.append(output.block)
                    elif isinstance(output, ModelFinish):
                        finish = output.reason
        except ModelAdapterError as error:
            raise _provider_error(error) from error
        calls = [block for block in blocks if isinstance(block, ToolCallBlock)]
        if not tool:
            if (
                finish is not ModelFinishReason.STOP
                or calls
                or not any(
                    isinstance(block, TextBlock) and block.text.strip()
                    for block in blocks
                )
            ):
                raise _protocol_error("The provider returned an invalid text response.")
            return
        if (
            finish is not ModelFinishReason.TOOL_CALLS
            or len(calls) != 1
            or calls[0].name != PROBE_TOOL_NAME
        ):
            raise _protocol_error("The model did not return the required tool call.")
        if json.loads(calls[0].arguments) != {"token": PROBE_TOKEN}:
            raise _protocol_error("The model returned invalid tool arguments.")


def _catalog_route(config: ProviderConfig) -> tuple[ModelProtocol, str]:
    if config.protocol is ModelProtocol.DEEPSEEK_MESSAGES:
        parsed = urlsplit(config.base_url)
        if parsed.hostname == "api.deepseek.com":
            # DeepSeek publishes its catalog at the OpenAI endpoint even for Messages.
            return ModelProtocol.OPENAI_COMPATIBLE, urlunsplit(
                (parsed.scheme, parsed.netloc, "", "", "")
            )
    return config.protocol, config.base_url


def _provider_error(error: ModelAdapterError) -> ProviderRequestError:
    code = {
        ModelErrorCode.PROVIDER_AUTH: ProviderErrorCode.AUTH,
        ModelErrorCode.CREDENTIAL_UNAVAILABLE: ProviderErrorCode.AUTH,
        ModelErrorCode.PROVIDER_TIMEOUT: ProviderErrorCode.TIMEOUT,
        ModelErrorCode.PROVIDER_NETWORK: ProviderErrorCode.NETWORK,
    }.get(error.code, ProviderErrorCode.PROTOCOL)
    return ProviderRequestError(code, str(error))


def _optional_display_name(item: dict[str, Any]) -> str | None:
    value = item.get("name")
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized or len(normalized) > MAX_MODEL_ID_LENGTH:
        return None
    return normalized


def _reasoning_metadata(item: dict[str, Any]) -> tuple[tuple[str, ...], str | None]:
    if "effort" not in item:
        return (), None
    metadata = item["effort"]
    if not isinstance(metadata, dict):
        raise _protocol_error("The provider reasoning metadata is invalid.")
    levels = metadata.get("supported_levels")
    default = metadata.get("default_level")
    if (
        not isinstance(levels, list)
        or not levels
        or any(
            not isinstance(level, str) or not level.strip() or level != level.strip()
            for level in levels
        )
        or len(set(levels)) != len(levels)
        or (default is not None and default not in levels)
    ):
        raise _protocol_error("The provider reasoning metadata is invalid.")
    return tuple(levels), default


def _protocol_error(message: str) -> ProviderRequestError:
    return ProviderRequestError(ProviderErrorCode.PROTOCOL, message)


def _elapsed_ms(started_at: float) -> int:
    return max(0, round((monotonic() - started_at) * 1_000))
