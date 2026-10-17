"""Prepared SDK models; protocol encoding and stream decoding belong to Pydantic AI."""

import math
from dataclasses import replace
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime

import anthropic
import httpx
import httpx2
import openai
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIResponsesModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.openai import OpenAIProvider

from kunyu.agent.runtime.contracts.models import ModelAdapterError, ModelErrorCode
from kunyu.domain.models.model_connections import (
    MaxTokensField,
    ModelProtocol,
    ModelProviderType,
)
from kunyu.integrations.model.connection import api_root, messages_root
from kunyu.integrations.model.context_overflow import is_context_overflow
from kunyu.integrations.model.sdk_http import ModelSDKTransport
from kunyu.integrations.model.sdk_observation import (
    ObservedSDKStream,
    SDKObservation,
    protocol_error,
)

STREAM_IDLE_TIMEOUT_SECONDS = 300
MODEL_HTTP_TIMEOUT = httpx2.Timeout(300, connect=10)


class _ObservedClient:
    async def request(self, *args, **kwargs):
        value = await super().request(*args, **kwargs)
        if kwargs.get("stream"):
            media_type = (
                value.response.headers.get("content-type", "")
                .partition(";")[0]
                .strip()
                .lower()
            )
            if media_type != "text/event-stream":
                await value.close()
                raise protocol_error("The provider returned a non-streaming response.")
            return ObservedSDKStream(value, self.observation)
        return value


class _ConnectionOpenAI(_ObservedClient, openai.AsyncOpenAI):
    @property
    def default_headers(self):
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": self.user_agent,
        }


class _ConnectionAnthropic(_ObservedClient, anthropic.AsyncAnthropic):
    @property
    def default_headers(self):
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": self.user_agent,
            "anthropic-version": "2023-06-01",
        }


class ConfiguredChatModel(OpenAIChatModel):
    def __init__(self, *args, include_usage: bool, **kwargs):
        super().__init__(*args, **kwargs)
        self.include_usage = include_usage

    def _get_stream_options(self, model_settings):
        return (
            super()._get_stream_options(model_settings)
            if self.include_usage
            else openai.Omit()
        )


class PreparedSDKModel:
    def __init__(
        self, client: httpx.AsyncClient, config, model_id: str, api_key: str | None
    ) -> None:
        self.config, self.model_id = config, model_id
        self.observation = SDKObservation()
        self.terminal_receipt = config.protocol is ModelProtocol.OPENAI_RESPONSES
        self.http = httpx2.AsyncClient(
            transport=ModelSDKTransport(client),
            follow_redirects=False,
            trust_env=False,
            timeout=MODEL_HTTP_TIMEOUT,
        )
        self.settings = {
            "timeout": MODEL_HTTP_TIMEOUT,
            "extra_body": config.reasoning_parameters.payload(),
        }
        if config.protocol is ModelProtocol.DEEPSEEK_MESSAGES:
            self.headers = {
                "X-Api-Key": api_key if api_key is not None else anthropic.Omit(),
                "Authorization": anthropic.Omit(),
            }
            self.client = _ConnectionAnthropic(
                api_key=api_key if api_key is not None else "",
                auth_token="",
                base_url=messages_root(config.base_url).removesuffix("/v1"),
                http_client=self.http,
                max_retries=0,
            )
            self.client.observation = self.observation
            self.model = AnthropicModel(
                model_id,
                provider=AnthropicProvider(anthropic_client=self.client),
                profile={},
            )
        else:
            self.headers = {
                "Authorization": f"Bearer {api_key}"
                if api_key is not None
                else openai.Omit(),
                "OpenAI-Organization": openai.Omit(),
                "OpenAI-Project": openai.Omit(),
            }

            async def credential():
                return api_key if api_key is not None else ""

            self.client = _ConnectionOpenAI(
                api_key=credential,
                admin_api_key="",
                organization="",
                project="",
                base_url=api_root(config.base_url),
                http_client=self.http,
                max_retries=0,
            )
            self.client.observation = self.observation
            provider = OpenAIProvider(openai_client=self.client)
            if config.protocol is ModelProtocol.OPENAI_RESPONSES:
                self.model = OpenAIResponsesModel(
                    model_id,
                    provider=provider,
                    profile={"openai_supports_encrypted_reasoning_content": True},
                )
                self.settings.update(
                    openai_store=False,
                    openai_previous_response_id=None,
                    openai_send_reasoning_ids=True,
                )
            elif config.protocol is ModelProtocol.OPENAI_COMPATIBLE:
                profile = {
                    "openai_chat_streaming_requires_finish_reason": True,
                    "openai_chat_supports_max_completion_tokens": config.max_tokens_field
                    is MaxTokensField.MAX_COMPLETION_TOKENS,
                    "openai_chat_send_back_thinking_parts": "field"
                    if config.provider_type
                    in {
                        ModelProviderType.DEEPSEEK,
                        ModelProviderType.MOONSHOT,
                        ModelProviderType.MIMO,
                        ModelProviderType.ZAI,
                    }
                    else False,
                    "openai_chat_thinking_field": "reasoning_content",
                    "thinking_tags": None,
                }
                self.model = ConfiguredChatModel(
                    model_id,
                    provider=provider,
                    profile=profile,
                    include_usage=config.include_usage,
                )
            else:
                raise ModelAdapterError(
                    ModelErrorCode.INVALID_REQUEST, "Unsupported SDK model API."
                )
        self.settings["extra_headers"] = self.headers

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.client.close()

    async def models(self):
        page = await self.client.models.list(extra_headers=self.headers)
        return page.model_dump(mode="json", exclude_unset=True, warnings="error")

    def final_response(self, stream, parameters):
        if self.terminal_receipt:
            if self.observation.terminal_response is None:
                raise protocol_error(
                    "The SDK did not receive its authoritative response receipt."
                )
            response = self.model._process_response(
                self.observation.terminal_response, self.settings, parameters
            )
        else:
            response = stream.get()
        parts = []
        for part in response.parts:
            if isinstance(part, ToolCallPart) and part.args is None:
                if part.tool_call_id not in self.observation.native_tool_inputs:
                    raise protocol_error(
                        "The SDK tool call has no provider argument receipt."
                    )
                part = replace(
                    part, args=self.observation.native_tool_inputs[part.tool_call_id]
                )
            parts.append(part)
        return replace(response, parts=parts)


def sdk_error(
    error: openai.APIError
    | anthropic.APIError
    | httpx.RequestError
    | httpx2.RequestError
    | TimeoutError,
) -> ModelAdapterError:
    """Classify SDK failures without exposing provider bodies or credentials."""
    if isinstance(
        error,
        (
            openai.APITimeoutError,
            anthropic.APITimeoutError,
            httpx.TimeoutException,
            httpx2.TimeoutException,
            TimeoutError,
        ),
    ):
        return ModelAdapterError(
            ModelErrorCode.PROVIDER_TIMEOUT, "The provider request timed out."
        )
    if isinstance(
        error,
        (
            openai.APIConnectionError,
            anthropic.APIConnectionError,
            httpx.RequestError,
            httpx2.RequestError,
        ),
    ):
        return ModelAdapterError(
            ModelErrorCode.PROVIDER_NETWORK, "The provider connection was interrupted."
        )
    body = error.body
    if is_context_overflow(body):
        return ModelAdapterError(
            ModelErrorCode.CONTEXT_WINDOW_EXCEEDED,
            "The provider rejected a request exceeding its context window.",
        )
    status = (
        error.status_code
        if isinstance(error, (openai.APIStatusError, anthropic.APIStatusError))
        else None
    )
    detail = body.get("error", body) if isinstance(body, dict) else {}
    kind = detail.get("type") if isinstance(detail, dict) else None
    code = (
        ModelErrorCode.PROVIDER_AUTH
        if status in {401, 403} or kind in {"authentication_error", "permission_error"}
        else ModelErrorCode.PROVIDER_RATE_LIMIT
        if status == 429 or kind == "rate_limit_error"
        else ModelErrorCode.PROVIDER_SERVER
        if (status is not None and status >= 500)
        or kind in {"api_error", "overloaded_error"}
        else ModelErrorCode.INVALID_REQUEST
        if (status is not None and 400 <= status < 500)
        or kind == "invalid_request_error"
        else ModelErrorCode.PROVIDER_PROTOCOL
    )
    response = (
        error.response
        if isinstance(error, (openai.APIStatusError, anthropic.APIStatusError))
        else None
    )
    return ModelAdapterError(
        code,
        "The provider rejected the model request.",
        provider_retry_after_ms=_retry_after(response.headers.get("retry-after"))
        if response is not None
        else None,
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
