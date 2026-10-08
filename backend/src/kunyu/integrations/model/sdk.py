"""Official SDK transport; Agent retry, replay and tool policy stay outside it."""

import asyncio
import json
import math
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime

import anthropic
import httpx
import openai
from pydantic import BaseModel

from kunyu.agent.runtime.models import ModelAdapterError, ModelErrorCode
from kunyu.domain.model_connections import ModelProtocol
from kunyu.integrations.model.connection import api_root, messages_root
from kunyu.integrations.model.context_overflow import is_context_overflow
from kunyu.integrations.model.sdk_http import ModelSDKTransport

MODEL_HTTP_TIMEOUT = httpx.Timeout(300, connect=10)
STREAM_IDLE_TIMEOUT_SECONDS = 300
MAX_MODEL_EVENT_BYTES = 2 * 1024 * 1024


class _ConnectionOpenAI(openai.AsyncOpenAI):
    @property
    def default_headers(self) -> dict[str, str]:
        # SDK environment headers are not part of the frozen connection contract.
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": self.user_agent,
        }


class _ConnectionAnthropic(anthropic.AsyncAnthropic):
    @property
    def default_headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": self.user_agent,
            "anthropic-version": "2023-06-01",
        }


class ProviderSDK:
    def __init__(
        self,
        client: httpx.AsyncClient,
        protocol: ModelProtocol,
        base_url: str,
        api_key: str | None,
    ) -> None:
        if client.follow_redirects:
            raise ValueError("The model HTTP client must not follow redirects.")
        if protocol not in {
            ModelProtocol.DEEPSEEK_MESSAGES,
            ModelProtocol.OPENAI_COMPATIBLE,
            ModelProtocol.OPENAI_RESPONSES,
        }:
            raise ModelAdapterError(
                ModelErrorCode.INVALID_REQUEST, "Unsupported model protocol."
            )
        self._protocol = protocol
        sdk_base_url = (
            messages_root(base_url).removesuffix("/v1")
            if protocol is ModelProtocol.DEEPSEEK_MESSAGES
            else api_root(base_url)
        )
        self._http = httpx.AsyncClient(
            transport=ModelSDKTransport(client),
            follow_redirects=False,
            trust_env=False,
            timeout=MODEL_HTTP_TIMEOUT,
        )
        if protocol is ModelProtocol.DEEPSEEK_MESSAGES:
            self._headers = {
                "Authorization": anthropic.Omit(),
                "X-Api-Key": api_key if api_key is not None else anthropic.Omit(),
            }
            self._sdk = _ConnectionAnthropic(
                base_url=sdk_base_url,
                api_key=api_key if api_key is not None else "",
                auth_token="",
                http_client=self._http,
                max_retries=0,
                timeout=MODEL_HTTP_TIMEOUT,
            )
        elif protocol in {
            ModelProtocol.OPENAI_COMPATIBLE,
            ModelProtocol.OPENAI_RESPONSES,
        }:
            self._headers = {
                "Authorization": f"Bearer {api_key}"
                if api_key is not None
                else openai.Omit(),
                "OpenAI-Organization": openai.Omit(),
                "OpenAI-Project": openai.Omit(),
            }

            async def credential() -> str:
                # Explicit auth:none must not read SDK credential environment variables.
                return api_key if api_key is not None else ""

            self._sdk = _ConnectionOpenAI(
                base_url=sdk_base_url,
                api_key=credential,
                admin_api_key="",
                organization="",
                project="",
                http_client=self._http,
                max_retries=0,
                timeout=MODEL_HTTP_TIMEOUT,
            )

    async def stream(self, payload: dict) -> AsyncIterator[dict]:
        try:
            body = payload.copy()
            model = body.pop("model")
            if body.pop("stream") is not True:
                raise ModelAdapterError(
                    ModelErrorCode.INVALID_REQUEST, "Model requests must stream."
                )
            if self._protocol is ModelProtocol.DEEPSEEK_MESSAGES:
                stream = await self._sdk.messages.create(
                    model=model,
                    messages=body.pop("messages"),
                    max_tokens=body.pop("max_tokens"),
                    stream=True,
                    extra_body=body,
                    extra_headers=self._headers,
                )
            elif self._protocol is ModelProtocol.OPENAI_RESPONSES:
                stream = await self._sdk.responses.create(
                    model=model,
                    input=body.pop("input"),
                    stream=True,
                    extra_body=body,
                    extra_headers=self._headers,
                )
            else:
                stream = await self._sdk.chat.completions.create(
                    model=model,
                    messages=body.pop("messages"),
                    stream=True,
                    extra_body=body,
                    extra_headers=self._headers,
                )
            async with stream:
                content_type = stream.response.headers.get("content-type", "")
                if (
                    content_type.partition(";")[0].strip().lower()
                    != "text/event-stream"
                ):
                    raise ModelAdapterError(
                        ModelErrorCode.PROVIDER_PROTOCOL,
                        "The provider returned a non-streaming response.",
                    )
                iterator = stream.__aiter__()
                while True:
                    try:
                        async with asyncio.timeout(STREAM_IDLE_TIMEOUT_SECONDS):
                            event = await anext(iterator)
                    except StopAsyncIteration:
                        break
                    # exclude_unset preserves the difference between absent and zero usage.
                    if not isinstance(event, BaseModel):
                        raise ModelAdapterError(
                            ModelErrorCode.PROVIDER_PROTOCOL,
                            "The SDK returned an unsupported model event.",
                        )
                    native = event.model_dump(exclude_unset=True, warnings="error")
                    if (
                        len(
                            json.dumps(
                                native, ensure_ascii=False, allow_nan=False
                            ).encode("utf-8")
                        )
                        > MAX_MODEL_EVENT_BYTES
                    ):
                        raise ModelAdapterError(
                            ModelErrorCode.PROVIDER_PROTOCOL,
                            "The provider stream event was too large.",
                        )
                    yield native
        except (
            openai.APIError,
            anthropic.APIError,
            httpx.RequestError,
            TimeoutError,
        ) as error:
            # SDK exception messages can contain the full provider error body.
            raise sdk_error(error) from None
        except (ValueError, TypeError):
            raise ModelAdapterError(
                ModelErrorCode.PROVIDER_PROTOCOL,
                "The provider returned invalid model events.",
            ) from None
        finally:
            await self._http.aclose()

    async def models(self) -> dict:
        try:
            # Read exactly the configured endpoint's page; do not silently switch APIs.
            page = await self._sdk.models.list(extra_headers=self._headers)
            if not isinstance(page, BaseModel):
                raise ModelAdapterError(
                    ModelErrorCode.PROVIDER_PROTOCOL,
                    "The SDK returned an invalid model catalog.",
                )
            return page.model_dump(mode="json", exclude_unset=True, warnings="error")
        except (
            openai.APIError,
            anthropic.APIError,
            httpx.RequestError,
            TimeoutError,
        ) as error:
            raise sdk_error(error) from None
        except (ValueError, TypeError):
            raise ModelAdapterError(
                ModelErrorCode.PROVIDER_PROTOCOL,
                "The provider returned an invalid model catalog.",
            ) from None
        finally:
            await self._http.aclose()


def sdk_error(
    error: openai.APIError | anthropic.APIError | httpx.RequestError | TimeoutError,
) -> ModelAdapterError:
    """Classify SDK failures without exposing provider bodies or credentials."""
    if isinstance(
        error,
        (
            openai.APITimeoutError,
            anthropic.APITimeoutError,
            httpx.TimeoutException,
            TimeoutError,
        ),
    ):
        return ModelAdapterError(
            ModelErrorCode.PROVIDER_TIMEOUT, "The provider request timed out."
        )
    if isinstance(
        error,
        (openai.APIConnectionError, anthropic.APIConnectionError, httpx.RequestError),
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
