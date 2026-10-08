"""Bound SDK responses while borrowing the application's HTTP connection pool."""

from collections.abc import AsyncIterator

import httpx

from kunyu.agent.runtime.models import ModelAdapterError, ModelErrorCode

MAX_MODEL_RESPONSE_BYTES = 2 * 1024 * 1024


class ModelSDKTransport(httpx.AsyncBaseTransport):
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        response = await self._client.send(request, stream=True)
        headers = [
            (name, value)
            for name, value in response.headers.multi_items()
            if name.lower() not in {"content-encoding", "content-length"}
        ]
        return httpx.Response(
            response.status_code,
            headers=headers,
            stream=_BoundedResponse(response),
            extensions=response.extensions,
        )


class _BoundedResponse(httpx.AsyncByteStream):
    def __init__(self, response: httpx.Response) -> None:
        self._response = response

    async def __aiter__(self) -> AsyncIterator[bytes]:
        content_type = self._response.headers.get("content-type", "")
        events = content_type.partition(";")[0].strip().lower() == "text/event-stream"
        size = 0
        line_has_content = False
        try:
            async for chunk in self._response.aiter_bytes():
                if events:
                    # Only bound bytes between blank lines; SSE decoding belongs to the SDK.
                    parts = chunk.split(b"\n")
                    for index, part in enumerate(parts):
                        newline = index < len(parts) - 1
                        size += len(part) + int(newline)
                        line_has_content = line_has_content or bool(part.strip(b"\r"))
                        _require_size(size)
                        if newline:
                            if not line_has_content:
                                size = 0
                            line_has_content = False
                else:
                    size += len(chunk)
                    _require_size(size)
                yield chunk
        finally:
            await self._response.aclose()

    async def aclose(self) -> None:
        await self._response.aclose()


def _require_size(size: int) -> None:
    if size > MAX_MODEL_RESPONSE_BYTES:
        raise ModelAdapterError(
            ModelErrorCode.PROVIDER_PROTOCOL, "The provider response was too large."
        )
