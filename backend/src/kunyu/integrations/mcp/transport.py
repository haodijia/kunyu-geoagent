"""SDK transports observed for EOF; protocol decoding belongs to the SDK."""

import asyncio
from contextlib import asynccontextmanager

import anyio
import httpx2
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.streamable_http import streamable_http_client

from kunyu.domain.mcp import McpSecrets, McpServerConfig


class ObservedReadStream:
    def __init__(self, source, lost: asyncio.Event) -> None:
        self.source, self.lost = source, lost

    async def receive(self):
        try:
            item = await self.source.receive()
        except (
            anyio.EndOfStream,
            anyio.ClosedResourceError,
            anyio.BrokenResourceError,
        ):
            self.lost.set()
            raise
        if isinstance(item, Exception):
            self.lost.set()
        return item

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return await self.receive()
        except anyio.EndOfStream:
            raise StopAsyncIteration from None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        await self.source.aclose()


@asynccontextmanager
async def connect_transport(
    config: McpServerConfig, secrets: McpSecrets, lost: asyncio.Event
):
    if config.transport == "stdio":
        params = StdioServerParameters(
            command=config.command,
            args=list(config.args),
            env=secrets.env,
            cwd=config.cwd,
        )
        async with stdio_client(params) as (read, write):
            yield ObservedReadStream(read, lost), write
    else:
        async with httpx2.AsyncClient(
            headers=secrets.headers,
            follow_redirects=False,
            timeout=httpx2.Timeout(config.tool_timeout_ms / 1000, connect=10),
            trust_env=False,
        ) as http:
            async with streamable_http_client(
                config.url, http_client=http, max_sse_event_size=32 * 1024 * 1024
            ) as (read, write):
                yield ObservedReadStream(read, lost), write
