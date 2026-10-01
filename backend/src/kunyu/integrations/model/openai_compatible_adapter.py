import asyncio
import json
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx

from kunyu.agent.runtime.models import (
    ModelAdapterError,
    ModelErrorCode,
    ModelMessage,
    ModelOutput,
    ModelRequest,
    ModelRole,
    ModelToolCall,
)
from kunyu.agent.runtime.tools import ToolSpec
from kunyu.domain.model_connections import MaxTokensField, ModelAuthMode
from kunyu.integrations.model.openai_chat_stream import OpenAIChatStreamParser

STREAM_IDLE_TIMEOUT_SECONDS = 30
MAX_SSE_EVENT_BYTES = 2 * 1024 * 1024
MAX_MODEL_OUTPUT_TOKENS = 4_096
MODEL_HTTP_TIMEOUT = httpx.Timeout(30, connect=10)

type CredentialResolver = Callable[[str, int], Awaitable[str | None]]


@dataclass(frozen=True, slots=True)
class OpenAICompatibleModelConfig:
    connection_id: str
    config_revision: int
    base_url: str
    auth_mode: ModelAuthMode
    max_tokens_field: MaxTokensField
    include_usage: bool
    reasoning_efforts: tuple[str, ...] = ()


class OpenAICompatibleModelAdapter:
    def __init__(
        self,
        client: httpx.AsyncClient,
        credential_resolver: CredentialResolver | None = None,
    ) -> None:
        if client.follow_redirects:
            raise ValueError("The model HTTP client must not follow redirects.")
        self._client = client
        self._credential_resolver = credential_resolver

    async def stream(
        self,
        request: ModelRequest[OpenAICompatibleModelConfig],
    ) -> AsyncIterator[ModelOutput]:
        config = request.adapter_config
        body = _encode_request(request)
        url = _completion_url(config.base_url)
        api_key = await self._resolve_api_key(config)
        headers = {
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
        }
        if api_key is not None:
            headers["Authorization"] = f"Bearer {api_key}"

        terminal_outputs: tuple[ModelOutput, ...] | None = None
        try:
            async with self._client.stream(
                "POST",
                url,
                headers=headers,
                content=body,
                timeout=MODEL_HTTP_TIMEOUT,
            ) as response:
                _validate_response(response)
                parser = OpenAIChatStreamParser()
                async for data in _iter_sse_data(response):
                    outputs = parser.push(data)
                    if parser.complete:
                        terminal_outputs = outputs
                        break
                    for output in outputs:
                        yield output
                if terminal_outputs is None:
                    terminal_outputs = parser.end()
        except ModelAdapterError:
            raise
        except TimeoutError as error:
            raise ModelAdapterError(
                ModelErrorCode.PROVIDER_TIMEOUT,
                "The provider stream timed out.",
            ) from error
        except httpx.TimeoutException as error:
            raise ModelAdapterError(
                ModelErrorCode.PROVIDER_TIMEOUT,
                "The provider stream timed out.",
            ) from error
        except httpx.RequestError as error:
            raise ModelAdapterError(
                ModelErrorCode.PROVIDER_NETWORK,
                "The provider stream was interrupted.",
            ) from error

        for output in terminal_outputs:
            yield output

    async def _resolve_api_key(self, config: OpenAICompatibleModelConfig) -> str | None:
        if config.auth_mode is ModelAuthMode.NONE:
            return None
        if config.auth_mode is not ModelAuthMode.API_KEY:
            raise ModelAdapterError(
                ModelErrorCode.INVALID_REQUEST,
                "The model authentication mode is unsupported.",
            )
        if self._credential_resolver is None:
            raise ModelAdapterError(
                ModelErrorCode.CREDENTIAL_UNAVAILABLE,
                "The model credential resolver is unavailable.",
            )
        try:
            api_key = await self._credential_resolver(
                config.connection_id,
                config.config_revision,
            )
        except ModelAdapterError:
            raise
        except Exception as error:
            raise ModelAdapterError(
                ModelErrorCode.CREDENTIAL_UNAVAILABLE,
                "The model credential could not be read.",
            ) from error
        if api_key is None or not api_key:
            raise ModelAdapterError(
                ModelErrorCode.PROVIDER_AUTH,
                "The model credential is not configured.",
            )
        return api_key


async def _iter_sse_data(response: httpx.Response) -> AsyncIterator[str]:
    lines = response.aiter_lines().__aiter__()
    data_lines: list[str] = []
    event_size = 0
    while True:
        try:
            async with asyncio.timeout(STREAM_IDLE_TIMEOUT_SECONDS):
                line = await anext(lines)
        except StopAsyncIteration:
            break
        if line == "":
            if data_lines:
                yield "\n".join(data_lines)
                data_lines = []
                event_size = 0
            continue
        if line.startswith(":"):
            continue
        field, separator, value = line.partition(":")
        if field != "data" or not separator:
            continue
        value = value.removeprefix(" ")
        event_size += len(value.encode("utf-8"))
        if event_size > MAX_SSE_EVENT_BYTES:
            raise ModelAdapterError(
                ModelErrorCode.PROVIDER_PROTOCOL,
                "The provider stream event was too large.",
            )
        data_lines.append(value)
    if data_lines:
        yield "\n".join(data_lines)


def _encode_request(
    request: ModelRequest[OpenAICompatibleModelConfig],
) -> bytes:
    config = request.adapter_config
    _validate_config(config)
    if (
        not isinstance(request.run_id, str)
        or not request.run_id
        or not isinstance(request.model_id, str)
        or not request.model_id
        or request.model_id != request.model_id.strip()
        or len(request.model_id) > 256
    ):
        raise _invalid_request("The model request identity is invalid.")
    if not request.messages:
        raise _invalid_request("The model request must contain a message.")
    if (
        isinstance(request.max_output_tokens, bool)
        or not isinstance(request.max_output_tokens, int)
        or not 1 <= request.max_output_tokens <= MAX_MODEL_OUTPUT_TOKENS
    ):
        raise _invalid_request(
            f"max_output_tokens must be between 1 and {MAX_MODEL_OUTPUT_TOKENS}."
        )
    if (
        request.reasoning_effort is not None
        and request.reasoning_effort not in config.reasoning_efforts
    ):
        raise ModelAdapterError(
            ModelErrorCode.UNSUPPORTED_CAPABILITY,
            "The selected reasoning effort is not supported by this model.",
        )
    messages = [_serialize_message(message) for message in request.messages]
    tools = [_serialize_tool(tool) for tool in request.tools]
    _require_unique_tool_names(tools)
    payload: dict[str, object] = {
        "model": request.model_id,
        "messages": messages,
        "stream": True,
        config.max_tokens_field.value: request.max_output_tokens,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    if config.include_usage:
        payload["stream_options"] = {"include_usage": True}
    if request.reasoning_effort is not None:
        payload["reasoning_effort"] = request.reasoning_effort
    try:
        return json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise _invalid_request("The model request is not JSON serializable.") from error


def _serialize_message(message: ModelMessage) -> dict[str, object]:
    if not isinstance(message.role, ModelRole) or not isinstance(message.content, str):
        raise _invalid_request("The model message is invalid.")
    payload: dict[str, object] = {
        "role": message.role.value,
        "content": message.content,
    }
    if message.role is ModelRole.TOOL:
        if (
            not isinstance(message.tool_call_id, str)
            or not message.tool_call_id.strip()
            or len(message.tool_call_id) > 256
            or message.tool_calls
        ):
            raise _invalid_request("The tool result message is invalid.")
        payload["tool_call_id"] = message.tool_call_id
        return payload
    if message.tool_call_id is not None:
        raise _invalid_request("Only tool result messages may name tool_call_id.")
    if message.tool_calls:
        if message.role is not ModelRole.ASSISTANT:
            raise _invalid_request("Only assistant messages may contain tool calls.")
        call_ids = [call.call_id for call in message.tool_calls]
        if len(set(call_ids)) != len(call_ids):
            raise _invalid_request("Assistant tool-call IDs must be unique.")
        payload["tool_calls"] = [
            _serialize_history_tool_call(call) for call in message.tool_calls
        ]
    return payload


def _serialize_history_tool_call(call: ModelToolCall) -> dict[str, object]:
    if (
        not isinstance(call.call_id, str)
        or not call.call_id.strip()
        or len(call.call_id) > 256
        or not isinstance(call.name, str)
        or not call.name.strip()
        or len(call.name) > 256
        or not isinstance(call.arguments, Mapping)
    ):
        raise _invalid_request("The assistant tool call is invalid.")
    return {
        "id": call.call_id,
        "type": "function",
        "function": {
            "name": call.name,
            "arguments": _json_string(dict(call.arguments)),
        },
    }


def _serialize_tool(tool: ToolSpec) -> dict[str, object]:
    if (
        not isinstance(tool.name, str)
        or not tool.name
        or len(tool.name) > 256
        or not isinstance(tool.description, str)
        or not isinstance(tool.parameters, Mapping)
    ):
        raise _invalid_request("The model tool definition is invalid.")
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": dict(tool.parameters),
        },
    }


def _require_unique_tool_names(tools: list[dict[str, object]]) -> None:
    names: set[str] = set()
    for tool in tools:
        function = tool["function"]
        if not isinstance(function, dict) or not isinstance(function.get("name"), str):
            raise _invalid_request("The model tool definition is invalid.")
        name = function["name"]
        if name in names:
            raise _invalid_request("Model tool names must be unique.")
        names.add(name)


def _validate_config(config: OpenAICompatibleModelConfig) -> None:
    if (
        not isinstance(config.connection_id, str)
        or not config.connection_id
        or not isinstance(config.base_url, str)
        or isinstance(config.config_revision, bool)
        or not isinstance(config.config_revision, int)
        or config.config_revision < 1
        or not isinstance(config.auth_mode, ModelAuthMode)
        or not isinstance(config.max_tokens_field, MaxTokensField)
        or not isinstance(config.include_usage, bool)
    ):
        raise _invalid_request("The model adapter configuration is invalid.")
    efforts = config.reasoning_efforts
    if not isinstance(efforts, tuple) or any(
        not isinstance(item, str) or not item for item in efforts
    ):
        raise _invalid_request("The reasoning capability configuration is invalid.")
    if len(set(efforts)) != len(efforts):
        raise _invalid_request("The reasoning capability configuration is invalid.")


def _json_string(value: object) -> str:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    except (TypeError, ValueError) as error:
        raise _invalid_request("The model request is not JSON serializable.") from error


def _completion_url(base_url: str) -> str:
    if len(base_url) > 2_048 or any(character.isspace() for character in base_url):
        raise _invalid_request("The model Base URL is invalid.")
    try:
        parsed = urlsplit(base_url)
        _ = parsed.port
    except ValueError as error:
        raise _invalid_request("The model Base URL is invalid.") from error
    if (
        parsed.scheme.lower() not in {"http", "https"}
        or parsed.hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise _invalid_request("The model Base URL is invalid.")
    normalized = base_url.rstrip("/")
    if not normalized:
        raise _invalid_request("The model Base URL is invalid.")
    return f"{normalized}/chat/completions"


def _validate_response(response: httpx.Response) -> None:
    if response.status_code in {401, 403}:
        raise ModelAdapterError(
            ModelErrorCode.PROVIDER_AUTH,
            "The provider rejected the configured credential.",
        )
    if not 200 <= response.status_code < 300:
        raise ModelAdapterError(
            ModelErrorCode.PROVIDER_PROTOCOL,
            "The provider rejected the model request.",
        )
    content_type = response.headers.get("content-type", "")
    if content_type.partition(";")[0].strip().lower() != "text/event-stream":
        raise ModelAdapterError(
            ModelErrorCode.PROVIDER_PROTOCOL,
            "The provider returned a non-streaming response.",
        )


def _invalid_request(message: str) -> ModelAdapterError:
    return ModelAdapterError(ModelErrorCode.INVALID_REQUEST, message)
