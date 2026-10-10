"""Unified model adapter over SDK transport and native context projections."""

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import anthropic
import httpx
import httpx2
import openai
from pydantic_ai import messages as sdk_messages_types
from pydantic_ai.exceptions import IncompleteToolCall, ModelHTTPError
from pydantic_ai.models import ModelRequestParameters
from pydantic_ai.tools import ToolDefinition

from kunyu.agent.model_providers import ModelProviderRegistry
from kunyu.agent.runtime.input_content import ImageInputBlock
from kunyu.agent.runtime.models import (
    ModelAdapterError,
    ModelErrorCode,
    ModelFinish,
    ModelFinishReason,
    ModelOutput,
    ModelRequest,
)
from kunyu.agent.scope import Context
from kunyu.domain.attachments import ImageAttachment
from kunyu.domain.model_connections import ModelAuthMode
from kunyu.integrations.model.connection import (
    ModelConnectionConfig,
    invalid_request,
    validate_request,
)
from kunyu.integrations.model.request_images import (
    MAX_INLINE_IMAGE_BYTES,
    RequestImage,
    prepare_image,
    raise_image_offload,
    required_image_offload,
)
from kunyu.integrations.model.sdk import STREAM_IDLE_TIMEOUT_SECONDS, sdk_error
from kunyu.integrations.model.sdk_content import replay_envelope, sdk_messages
from kunyu.integrations.model.sdk_events import SDKEventMapper
from kunyu.integrations.model.sdk_observation import protocol_error

logger = logging.getLogger(__name__)

type ImageResolver = Callable[[str, ImageAttachment], Awaitable[bytes]]

type CredentialResolver = Callable[[str, int], Awaitable[str | None]]


class SDKModelAdapter:
    def __init__(
        self,
        client: httpx.AsyncClient,
        providers: ModelProviderRegistry,
        context: Context,
        scope_resolver: Callable[[str], Context],
        credential_resolver: CredentialResolver | None = None,
        image_resolver: ImageResolver | None = None,
    ) -> None:
        if client.follow_redirects:
            raise ValueError("The model HTTP client must not follow redirects.")
        self._client = client
        self.providers, self.context, self._scope_resolver = (
            providers,
            context,
            scope_resolver,
        )
        self._credential_resolver = credential_resolver
        self._image_resolver = image_resolver

    async def stream(
        self,
        request: ModelRequest[ModelConnectionConfig],
    ) -> AsyncIterator[ModelOutput]:
        async with self._lease(
            self._scope_resolver(request.run_id), request.adapter_config
        ) as registration:
            api_key = await self._resolve_api_key(request.adapter_config)
            async for output in self._execute(request, registration, api_key):
                yield output

    async def check_stream(self, request, api_key):
        async with self._lease(self.context, request.adapter_config) as registration:
            async for output in self._execute(request, registration, api_key):
                yield output

    @asynccontextmanager
    async def _lease(self, scope, config):
        registration = self.providers.require(scope, config)
        registration.owner.assert_active()
        detach = registration.owner.effect(asyncio.current_task().cancel)
        try:
            yield registration
        finally:
            detach()

    async def models(self, config, api_key):
        try:
            async with self._lease(self.context, config) as registration:
                result = await registration.provider.models(
                    self._client, config, api_key
                )
                registration.owner.assert_active()
                return result
        except Exception as error:
            raise translate_error(error) from None

    async def _execute(self, request, registration, api_key):
        config = request.adapter_config
        validate_request(request)
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
        registration.owner.assert_active()
        try:
            params = ModelRequestParameters(
                function_tools=[
                    ToolDefinition(
                        name=tool.name,
                        description=tool.description,
                        parameters_json_schema=dict(tool.parameters),
                        strict=False,
                    )
                    for tool in request.tools
                ]
            )
            async with registration.provider.prepare(
                self._client, config, request.model_id, api_key
            ) as prepared:
                prepared.settings["max_tokens"] = request.max_output_tokens
                mapper = SDKEventMapper(defer_close=prepared.terminal_receipt)
                async with prepared.model.request_stream(
                    sdk_messages(request, images), prepared.settings, params
                ) as stream:
                    iterator = stream.__aiter__()
                    while True:
                        try:
                            async with asyncio.timeout(STREAM_IDLE_TIMEOUT_SECONDS):
                                event = await anext(iterator)
                        except StopAsyncIteration:
                            break
                        except IncompleteToolCall:
                            if stream.finish_reason != "length":
                                raise
                            break
                        registration.owner.assert_active()
                        for output in mapper.push(event):
                            yield output
                    response = prepared.final_response(stream, params)
                    usage = prepared.observation.usage()
                    if usage is not None:
                        yield usage
                    if (
                        not prepared.observation.terminal
                        or response.finish_reason is None
                    ):
                        raise protocol_error(
                            "The SDK stream ended without a provider terminal event."
                        )
                    tools = [
                        part
                        for part in response.parts
                        if isinstance(part, sdk_messages_types.ToolCallPart)
                    ]
                    if any(
                        part.tool_call_id not in prepared.observation.native_tool_ids
                        for part in tools
                    ):
                        raise protocol_error(
                            "The SDK tool identity was not reported by the provider."
                        )
                    if len({part.tool_call_id for part in tools}) != len(tools):
                        raise protocol_error(
                            "The SDK tool-call identity is duplicated."
                        )
                    if response.finish_reason == "length":
                        finish = ModelFinish(ModelFinishReason.LENGTH)
                    elif response.finish_reason == "content_filter":
                        finish = ModelFinish(ModelFinishReason.CONTENT_FILTER)
                    elif (
                        response.finish_reason in {"stop", "tool_call"}
                        and response.state == "complete"
                    ):
                        finish = ModelFinish(
                            ModelFinishReason.TOOL_CALLS
                            if tools
                            else ModelFinishReason.STOP,
                            replay_envelope(response, config, request.model_id),
                        )
                    else:
                        raise protocol_error(
                            "The SDK returned an unsupported completion state."
                        )
                    for output in mapper.finalize(response):
                        yield output
                # Native responses are closed before the Agent consumes a settlement.
            yield finish
        except Exception as error:
            raise translate_error(error) from None

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


def translate_error(error: Exception) -> ModelAdapterError:
    if isinstance(error, ModelAdapterError):
        return error
    cursor = error
    while cursor is not None:
        if isinstance(cursor, ModelAdapterError):
            return cursor
        if isinstance(
            cursor,
            (
                openai.APIError,
                anthropic.APIError,
                httpx.RequestError,
                httpx2.RequestError,
                TimeoutError,
            ),
        ):
            return sdk_error(cursor)
        cursor = cursor.__cause__
    if isinstance(error, ModelHTTPError):
        from kunyu.integrations.model.context_overflow import is_context_overflow

        code = (
            ModelErrorCode.CONTEXT_WINDOW_EXCEEDED
            if is_context_overflow(error.body)
            else ModelErrorCode.PROVIDER_AUTH
            if error.status_code in {401, 403}
            else ModelErrorCode.PROVIDER_RATE_LIMIT
            if error.status_code == 429
            else ModelErrorCode.PROVIDER_SERVER
            if error.status_code >= 500
            else ModelErrorCode.INVALID_REQUEST
        )
        return ModelAdapterError(code, "The model SDK rejected the request.")
    return ModelAdapterError(
        ModelErrorCode.PROVIDER_PROTOCOL, "The model SDK returned invalid model data."
    )
