"""Unified model adapter over SDK transport and native context projections."""

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import aclosing

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
from kunyu.integrations.model.chat_events import ChatEventMapper
from kunyu.integrations.model.connection import (
    ModelConnectionConfig,
    invalid_request,
    validate_config,
)
from kunyu.integrations.model.messages_events import (
    MessagesEventMapper,
)
from kunyu.integrations.model.messages_request import (
    project_request as project_messages_request,
)
from kunyu.integrations.model.openai_chat_request import (
    project_request as project_chat_request,
)
from kunyu.integrations.model.openai_responses_request import (
    project_request as project_responses_request,
)
from kunyu.integrations.model.request_images import (
    MAX_INLINE_IMAGE_BYTES,
    RequestImage,
    prepare_image,
    raise_image_offload,
    required_image_offload,
)
from kunyu.integrations.model.responses_events import ResponsesEventMapper
from kunyu.integrations.model.sdk import ProviderSDK

logger = logging.getLogger(__name__)

type ImageResolver = Callable[[str, ImageAttachment], Awaitable[bytes]]

type CredentialResolver = Callable[[str, int], Awaitable[str | None]]


class SDKModelAdapter:
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
            payload = project_messages_request(request, images)
            mapper = MessagesEventMapper(request.model_id)
        elif config.protocol is ModelProtocol.OPENAI_RESPONSES:
            payload = project_responses_request(request, images)
            mapper = ResponsesEventMapper(
                request.model_id,
                config.connection_id,
                config.base_url,
                config.config_revision,
            )
        elif config.protocol is ModelProtocol.OPENAI_COMPATIBLE:
            payload = project_chat_request(request, images)
            mapper = ChatEventMapper()
        else:
            raise invalid_request("Unsupported model protocol.")
        api_key = await self._resolve_api_key(config)
        sdk = ProviderSDK(self._client, config.protocol, config.base_url, api_key)
        terminal_outputs: tuple[ModelOutput, ...] | None = None
        async with aclosing(sdk.stream(payload)) as events:
            async for event in events:
                outputs = mapper.push(event)
                if mapper.complete:
                    terminal_outputs = outputs
                    break
                for output in outputs:
                    yield output
            if terminal_outputs is None:
                terminal_outputs = mapper.end()
        # Close the provider response before the Agent consumes a terminal event.
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
