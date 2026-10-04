"""HTTP model transport with explicit Chat Completions or native Messages routing."""

import asyncio
import math
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime

import httpx

from kunyu.agent.runtime.input_content import ImageInputBlock
from kunyu.agent.runtime.models import (
    ModelAdapterError,
    ModelErrorCode,
    ModelOutput,
    ModelRequest,
)
from kunyu.domain.attachments import ImageAttachment
from kunyu.domain.model_connections import ModelAuthMode, ModelProtocol
from kunyu.integrations.model.connection import (
    ModelConnectionConfig,
    api_root,
    invalid_request,
    messages_root,
)
from kunyu.integrations.model.deepseek_messages_request import (
    encode_request as encode_messages_request,
)
from kunyu.integrations.model.deepseek_messages_stream import (
    DeepSeekMessagesStreamParser,
)
from kunyu.integrations.model.openai_chat_request import (
    encode_request as encode_chat_request,
)
from kunyu.integrations.model.openai_chat_stream import OpenAIChatStreamParser

STREAM_IDLE_TIMEOUT_SECONDS = 300
MAX_SSE_EVENT_BYTES = 2 * 1024 * 1024
MODEL_HTTP_TIMEOUT = httpx.Timeout(300, connect=10)

type ImageResolver = Callable[[str, ImageAttachment], Awaitable[bytes]]

type CredentialResolver = Callable[[str, int], Awaitable[str | None]]


class HTTPModelAdapter:
    def __init__(
        self,
        client: httpx.AsyncClient,
        credential_resolver: CredentialResolver | None = None,
        image_resolver: ImageResolver | None = None,
    ) -> None:
        if client.follow_redirects:
            raise ValueError("The model HTTP client must not follow redirects.")
        self._client = client
        self._credential_resolver = credential_resolver
        self._image_resolver = image_resolver

    async def stream(
        self,
        request: ModelRequest[ModelConnectionConfig],
    ) -> AsyncIterator[ModelOutput]:
        config = request.adapter_config
        images: dict[str, bytes] = {}
        image_refs = {}
        for message in request.messages:
            for block in message.content:
                if isinstance(block, ImageInputBlock):
                    if (
                        block.attachment.id in image_refs
                        and image_refs[block.attachment.id] != block.attachment
                    ):
                        raise invalid_request(
                            "One image identity has inconsistent receipts."
                        )
                    image_refs[block.attachment.id] = block.attachment
        for identity, ref in image_refs.items():
            if self._image_resolver is None:
                raise invalid_request("The image attachment resolver is unavailable.")
            images[identity] = await self._image_resolver(request.run_id, ref)
        if config.protocol is ModelProtocol.DEEPSEEK_MESSAGES:
            body = encode_messages_request(request, images)
            url = f"{messages_root(config.base_url)}/messages"
            parser = DeepSeekMessagesStreamParser(request.model_id)
        elif config.protocol is ModelProtocol.OPENAI_COMPATIBLE:
            body = encode_chat_request(request, images)
            url = f"{api_root(config.base_url)}/chat/completions"
            parser = OpenAIChatStreamParser()
        else:
            raise invalid_request("Unsupported model protocol.")
        api_key = await self._resolve_api_key(config)
        headers = {
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
        }
        if config.protocol is ModelProtocol.DEEPSEEK_MESSAGES:
            headers["anthropic-version"] = "2023-06-01"
            if api_key is not None:
                headers["x-api-key"] = api_key
        elif api_key is not None:
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

    async def _resolve_api_key(self, config: ModelConnectionConfig) -> str | None:
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


def _validate_response(response: httpx.Response) -> None:
    if response.status_code in {401, 403}:
        raise ModelAdapterError(
            ModelErrorCode.PROVIDER_AUTH,
            "The provider rejected the configured credential.",
        )
    if not 200 <= response.status_code < 300:
        code = (
            ModelErrorCode.PROVIDER_RATE_LIMIT
            if response.status_code == 429
            else ModelErrorCode.PROVIDER_SERVER
            if response.status_code >= 500
            else ModelErrorCode.INVALID_REQUEST
        )
        raise ModelAdapterError(
            code,
            "The provider rejected the model request.",
            provider_retry_after_ms=_retry_after(response.headers.get("retry-after")),
        )
    content_type = response.headers.get("content-type", "")
    if content_type.partition(";")[0].strip().lower() != "text/event-stream":
        raise ModelAdapterError(
            ModelErrorCode.PROVIDER_PROTOCOL,
            "The provider returned a non-streaming response.",
        )


def _retry_after(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        milliseconds = float(value) * 1_000
    except ValueError:
        try:
            date = parsedate_to_datetime(value)
            if date.tzinfo is None:
                return None
            milliseconds = (date - datetime.now(UTC)).total_seconds() * 1_000
        except (TypeError, ValueError, OverflowError):
            return None
    return milliseconds if math.isfinite(milliseconds) and milliseconds > 0 else None
