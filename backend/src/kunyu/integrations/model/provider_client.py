import asyncio
import json
from dataclasses import dataclass
from enum import StrEnum
from time import monotonic
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from kunyu.agent.runtime.content import TextBlock, ToolCallBlock
from kunyu.agent.runtime.models import ModelAdapterError
from kunyu.domain.model_connections import (
    MaxTokensField,
    ModelAuthMode,
    ModelProtocol,
    ModelProviderType,
)
from kunyu.integrations.model.connection import messages_root
from kunyu.integrations.model.openai_responses_items import item_block

MODEL_OPERATION_TIMEOUT_SECONDS = 30
MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_CATALOG_ENTRIES = 2_000
MAX_MODEL_ID_LENGTH = 256
CHECK_MAX_TOKENS = 16_384
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
        payload = await self._request_json(
            "GET",
            _models_url(config),
            config=config,
        )
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
        self, config: ProviderConfig, model_id: str
    ) -> ModelCheckOutcome:
        started_at = monotonic()
        try:
            async with asyncio.timeout(MODEL_OPERATION_TIMEOUT_SECONDS):
                await self._check_text_request(config, model_id)
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
        self, config: ProviderConfig, model_id: str
    ) -> ModelCheckOutcome:
        started_at = monotonic()
        text_passed = False
        try:
            async with asyncio.timeout(MODEL_OPERATION_TIMEOUT_SECONDS):
                await self._check_text_request(config, model_id)
                text_passed = True
                await self._check_tool_request(config, model_id)
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

    async def _check_text_request(self, config: ProviderConfig, model_id: str) -> None:
        if config.protocol is ModelProtocol.OPENAI_RESPONSES:
            await self._check_responses(config, model_id, tool=False)
            return
        if config.protocol is ModelProtocol.DEEPSEEK_MESSAGES:
            await self._check_messages(config, model_id, tool=False)
            return
        payload = await self._request_json(
            "POST",
            f"{config.base_url}/chat/completions",
            config=config,
            json_body={
                "model": model_id,
                "messages": [
                    {
                        "role": "user",
                        "content": "Reply with a short plain-text acknowledgement.",
                    }
                ],
                "stream": False,
                config.max_tokens_field.value: CHECK_MAX_TOKENS,
            },
        )
        choice = _single_choice(payload)
        message = choice.get("message")
        if (
            choice.get("finish_reason") != "stop"
            or not isinstance(message, dict)
            or not isinstance(message.get("content"), str)
            or not message["content"].strip()
        ):
            raise _protocol_error("The provider returned an invalid text completion.")

    async def _check_tool_request(self, config: ProviderConfig, model_id: str) -> None:
        if config.protocol is ModelProtocol.OPENAI_RESPONSES:
            await self._check_responses(config, model_id, tool=True)
            return
        if config.protocol is ModelProtocol.DEEPSEEK_MESSAGES:
            await self._check_messages(config, model_id, tool=True)
            return
        payload = await self._request_json(
            "POST",
            f"{config.base_url}/chat/completions",
            config=config,
            json_body={
                "model": model_id,
                "messages": [
                    {
                        "role": "user",
                        "content": (
                            "Call the required capability probe with token "
                            f"'{PROBE_TOKEN}'."
                        ),
                    }
                ],
                "stream": False,
                "tools": [
                    {
                        "type": "function",
                        "function": {
                            "name": PROBE_TOOL_NAME,
                            "description": "Checks structured tool-call support.",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "token": {
                                        "type": "string",
                                        "const": PROBE_TOKEN,
                                    }
                                },
                                "required": ["token"],
                                "additionalProperties": False,
                            },
                        },
                    }
                ],
                # Match the Agent adapter and deepseek-harness: thinking models
                # can reject a forced named choice even when Tool Call works.
                "tool_choice": "auto",
                config.max_tokens_field.value: CHECK_MAX_TOKENS,
            },
        )
        choice = _single_choice(payload)
        message = choice.get("message")
        tool_calls = message.get("tool_calls") if isinstance(message, dict) else None
        if choice.get("finish_reason") != "tool_calls" or not isinstance(
            tool_calls, list
        ):
            raise _protocol_error("The model did not return the required tool call.")
        if len(tool_calls) != 1:
            raise _protocol_error("The model returned an invalid tool-call batch.")
        tool_call = tool_calls[0]
        function = tool_call.get("function") if isinstance(tool_call, dict) else None
        if (
            not isinstance(tool_call, dict)
            or not isinstance(tool_call.get("id"), str)
            or not tool_call["id"].strip()
            or tool_call.get("type") != "function"
            or not isinstance(function, dict)
            or function.get("name") != PROBE_TOOL_NAME
            or not isinstance(function.get("arguments"), str)
        ):
            raise _protocol_error("The model returned an invalid tool call.")
        try:
            arguments = json.loads(function["arguments"])
        except (TypeError, ValueError) as error:
            raise _protocol_error(
                "The model returned invalid tool arguments."
            ) from error
        if arguments != {"token": PROBE_TOKEN}:
            raise _protocol_error("The model returned invalid tool arguments.")

    async def _check_responses(
        self, config: ProviderConfig, model_id: str, *, tool: bool
    ) -> None:
        body = {
            "model": model_id,
            "stream": False,
            "store": False,
            "include": ["reasoning.encrypted_content"],
            "max_output_tokens": CHECK_MAX_TOKENS,
            "input": [
                {
                    "role": "user",
                    "content": (
                        f"Call {PROBE_TOOL_NAME} with token '{PROBE_TOKEN}'."
                        if tool
                        else "Reply with a short plain-text acknowledgement."
                    ),
                }
            ],
        }
        if tool:
            body["tools"] = [
                {
                    "type": "function",
                    "name": PROBE_TOOL_NAME,
                    "description": "Checks structured tool-call support.",
                    "strict": False,
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "token": {"type": "string", "const": PROBE_TOKEN}
                        },
                        "required": ["token"],
                        "additionalProperties": False,
                    },
                }
            ]
            body["tool_choice"] = "auto"
        payload = await self._request_json(
            "POST",
            f"{config.base_url}/responses",
            config=config,
            json_body=body,
        )
        if (
            not isinstance(payload, dict)
            or payload.get("object") != "response"
            or payload.get("status") != "completed"
            or not isinstance(payload.get("output"), list)
            or any(not isinstance(item, dict) for item in payload["output"])
        ):
            raise _protocol_error(
                "The provider returned an invalid Responses completion."
            )
        try:
            blocks = [item_block(item) for item in payload["output"]]
        except ModelAdapterError as error:
            raise _protocol_error(
                "The provider returned invalid Responses items."
            ) from error
        calls = [block for block in blocks if isinstance(block, ToolCallBlock)]
        if not tool:
            if calls or not any(
                isinstance(block, TextBlock) and block.text.strip() for block in blocks
            ):
                raise _protocol_error("The provider returned an invalid text response.")
            return
        if len(calls) != 1 or calls[0].name != PROBE_TOOL_NAME:
            raise _protocol_error("The model did not return the required tool call.")
        if json.loads(calls[0].arguments) != {"token": PROBE_TOKEN}:
            raise _protocol_error("The model returned invalid tool arguments.")

    async def _check_messages(
        self, config: ProviderConfig, model_id: str, *, tool: bool
    ) -> None:
        body = {
            "model": model_id,
            "stream": False,
            "max_tokens": CHECK_MAX_TOKENS,
            "thinking": {"type": "disabled"},
            "messages": [
                {
                    "role": "user",
                    "content": (
                        f"Call {PROBE_TOOL_NAME} with token '{PROBE_TOKEN}'."
                        if tool
                        else "Reply with a short plain-text acknowledgement."
                    ),
                }
            ],
        }
        if tool:
            body["tools"] = [
                {
                    "name": PROBE_TOOL_NAME,
                    "description": "Checks structured tool-call support.",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "token": {"type": "string", "const": PROBE_TOKEN}
                        },
                        "required": ["token"],
                        "additionalProperties": False,
                    },
                }
            ]
            body["tool_choice"] = {"type": "auto"}
        payload = await self._request_json(
            "POST",
            f"{messages_root(config.base_url)}/messages",
            config=config,
            json_body=body,
        )
        if (
            not isinstance(payload, dict)
            or payload.get("type") != "message"
            or payload.get("role") != "assistant"
            or not isinstance(payload.get("content"), list)
        ):
            raise _protocol_error("The provider returned an invalid Messages response.")
        blocks = payload["content"]
        if any(not isinstance(block, dict) for block in blocks):
            raise _protocol_error("The provider returned invalid Messages blocks.")
        if not tool:
            if payload.get("stop_reason") != "end_turn" or not any(
                block.get("type") == "text"
                and isinstance(block.get("text"), str)
                and block["text"].strip()
                for block in blocks
            ):
                raise _protocol_error("The provider returned an invalid text response.")
            return
        calls = [block for block in blocks if block.get("type") == "tool_use"]
        if payload.get("stop_reason") != "tool_use" or len(calls) != 1:
            raise _protocol_error("The model did not return the required tool batch.")
        call = calls[0]
        if (
            not isinstance(call.get("id"), str)
            or not call["id"].strip()
            or call.get("name") != PROBE_TOOL_NAME
            or call.get("input") != {"token": PROBE_TOKEN}
        ):
            raise _protocol_error("The model returned invalid tool input.")

    async def _request_json(
        self,
        method: str,
        url: str,
        *,
        config: ProviderConfig,
        json_body: dict[str, Any] | None = None,
    ) -> Any:
        if (
            json_body is not None
            and config.provider_type is ModelProviderType.DEEPSEEK
            and config.protocol is not ModelProtocol.OPENAI_RESPONSES
        ):
            json_body["thinking"] = {"type": "disabled"}
        native_auth = config.protocol is ModelProtocol.DEEPSEEK_MESSAGES and not (
            method == "GET" and urlsplit(config.base_url).hostname == "api.deepseek.com"
        )
        headers = {"Accept": "application/json"}
        if native_auth:
            headers["anthropic-version"] = "2023-06-01"
        if json_body is not None:
            headers["Content-Type"] = "application/json"
        if config.auth_mode is ModelAuthMode.API_KEY:
            if config.api_key is None:
                raise _protocol_error("The model connection credential is missing.")
            if native_auth:
                headers["x-api-key"] = config.api_key
            else:
                headers["Authorization"] = f"Bearer {config.api_key}"
        try:
            async with asyncio.timeout(MODEL_OPERATION_TIMEOUT_SECONDS):
                async with self._client.stream(
                    method,
                    url,
                    headers=headers,
                    json=json_body,
                ) as response:
                    body = await _read_bounded_body(response)
        except TimeoutError as error:
            raise ProviderRequestError(
                ProviderErrorCode.TIMEOUT,
                "The provider request timed out.",
            ) from error
        except httpx.TimeoutException as error:
            raise ProviderRequestError(
                ProviderErrorCode.TIMEOUT,
                "The provider request timed out.",
            ) from error
        except httpx.RequestError as error:
            raise ProviderRequestError(
                ProviderErrorCode.NETWORK,
                "The provider could not be reached.",
            ) from error
        if response.status_code in {401, 403}:
            raise ProviderRequestError(
                ProviderErrorCode.AUTH,
                "The provider rejected the configured credential.",
            )
        if not 200 <= response.status_code < 300:
            raise _protocol_error("The provider rejected the request.")
        try:
            return json.loads(body)
        except (UnicodeDecodeError, ValueError) as error:
            raise _protocol_error("The provider returned invalid JSON.") from error


def _models_url(config: ProviderConfig) -> str:
    if config.protocol in {
        ModelProtocol.OPENAI_COMPATIBLE,
        ModelProtocol.OPENAI_RESPONSES,
    }:
        return f"{config.base_url}/models"
    parsed = urlsplit(config.base_url)
    if parsed.hostname == "api.deepseek.com":
        return urlunsplit((parsed.scheme, parsed.netloc, "/models", "", ""))
    return f"{messages_root(config.base_url)}/models"


async def _read_bounded_body(response: httpx.Response) -> bytes:
    chunks: list[bytes] = []
    size = 0
    async for chunk in response.aiter_bytes():
        size += len(chunk)
        if size > MAX_PROVIDER_RESPONSE_BYTES:
            raise _protocol_error("The provider response was too large.")
        chunks.append(chunk)
    return b"".join(chunks)


def _single_choice(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise _protocol_error("The provider returned an invalid completion.")
    choices = payload.get("choices")
    if not isinstance(choices, list) or len(choices) != 1:
        raise _protocol_error("The provider returned an invalid completion.")
    choice = choices[0]
    if not isinstance(choice, dict):
        raise _protocol_error("The provider returned an invalid completion.")
    return choice


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
