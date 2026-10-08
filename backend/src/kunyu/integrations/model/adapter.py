"""HTTP transport for explicitly selected Chat, Messages and Responses protocols."""

import asyncio
import json
import logging
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
    validate_config,
)
from kunyu.integrations.model.context_overflow import is_context_overflow
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
from kunyu.integrations.model.openai_responses_request import (
    encode_request as encode_responses_request,
)
from kunyu.integrations.model.openai_responses_stream import OpenAIResponsesStreamParser
from kunyu.integrations.model.request_images import (
    MAX_INLINE_IMAGE_BYTES,
    RequestImage,
    prepare_image,
    raise_image_offload,
    required_image_offload,
)

logger = logging.getLogger(__name__)

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
        validate_config(config)
        images: dict[str, RequestImage] = {}
        image_refs: dict[str, ImageAttachment] = {}
        occurrences: dict[str, int] = {}
        for message in request.messages:
            for block in message.content:
                if isinstance(block, ImageInputBlock) and block.offloaded is not True:
                    if (
                        block.attachment.id in image_refs
                        and image_refs[block.attachment.id] != block.attachment
                    ):
                        raise invalid_request(
                            "One image identity has inconsistent receipts."
                        )
                    image_refs[block.attachment.id] = block.attachment
                    occurrences[block.attachment.id] = (
                        occurrences.get(block.attachment.id, 0) + 1
                    )
        if image_refs and not config.image_input.enabled:
            raise ModelAdapterError(
                ModelErrorCode.UNSUPPORTED_CAPABILITY,
                "The selected model does not declare image input support.",
            )
        encoded_bytes = 0
        lengths_by_id: dict[str, int] = {}
        overflow = False
        for identity, ref in image_refs.items():
            if self._image_resolver is None:
                raise invalid_request("The image attachment resolver is unavailable.")
            data = await self._image_resolver(request.run_id, ref)
            image = await asyncio.to_thread(
                prepare_image, ref, data, config.image_input
            )
            encoded_bytes += 4 * ((len(image.data) + 2) // 3) * occurrences[identity]
            lengths_by_id[identity] = 4 * ((len(image.data) + 2) // 3)
            if encoded_bytes > MAX_INLINE_IMAGE_BYTES:
                overflow = True
                images.clear()
            if not overflow:
                images[identity] = image
            logger.info(
                "Model image projection run=%s model=%s attachment=%s source=%sx%s request=%sx%s bytes=%s occurrences=%s",
                request.run_id,
                request.model_id,
                identity,
                ref.width,
                ref.height,
                image.width,
                image.height,
                len(image.data),
                occurrences[identity],
            )
        lengths = [
            lengths_by_id[block.attachment.id]
            for message in request.messages
            for block in message.content
            if isinstance(block, ImageInputBlock) and block.offloaded is not True
        ]
        raise_image_offload(required_image_offload(lengths))
        if config.protocol is ModelProtocol.DEEPSEEK_MESSAGES:
            body = encode_messages_request(request, images)
            url = f"{messages_root(config.base_url)}/messages"
            parser = DeepSeekMessagesStreamParser(request.model_id)
        elif config.protocol is ModelProtocol.OPENAI_RESPONSES:
            body = encode_responses_request(request, images)
            url = f"{api_root(config.base_url)}/responses"
            parser = OpenAIResponsesStreamParser(
                request.model_id,
                config.connection_id,
                config.base_url,
                config.config_revision,
            )
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
                await _validate_response(response)
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


async def _validate_response(response: httpx.Response) -> None:
    if response.status_code in {401, 403}:
        raise ModelAdapterError(
            ModelErrorCode.PROVIDER_AUTH,
            "The provider rejected the configured credential.",
        )
    if not 200 <= response.status_code < 300:
        if response.status_code in {400, 413, 422}:
            content = bytearray()
            async for chunk in response.aiter_bytes():
                content.extend(chunk[: 65536 - len(content)])
                if len(content) == 65536:
                    break
            try:
                detail = json.loads(content)
            except (ValueError, UnicodeError):
                detail = None
            if is_context_overflow(detail):
                raise ModelAdapterError(
                    ModelErrorCode.CONTEXT_WINDOW_EXCEEDED,
                    "The provider rejected a request exceeding its context window.",
                )
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
