"""One-shot loopback OAuth callback; state is verified before consuming a code."""

import asyncio
import logging
import secrets
from urllib.parse import parse_qs, urlsplit

from mcp.shared.auth import AuthorizationCodeResult

logger = logging.getLogger(__name__)


class OAuthDenied(RuntimeError):
    pass


class OAuthCallback:
    def __init__(self) -> None:
        self.server: asyncio.Server | None = None
        self.result = asyncio.get_running_loop().create_future()
        self.state: str | None = None
        self.port = 0
        self.handlers: set[asyncio.Task] = set()

    async def open(self, port: int) -> str:
        self.server = await asyncio.start_server(
            self._handle, "127.0.0.1", port, limit=16384
        )
        self.port = self.server.sockets[0].getsockname()[1]
        return f"http://127.0.0.1:{self.port}/oauth/callback"

    async def _handle(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        task = asyncio.current_task()
        self.handlers.add(task)
        try:
            async with asyncio.timeout(5):
                request = await reader.readline()
                method, target, version = request.decode("ascii").strip().split(" ")
                headers = {}
                total = len(request)
                while True:
                    line = await reader.readline()
                    total += len(line)
                    if total > 16384:
                        raise ValueError("Callback headers exceed their limit.")
                    if line in {b"\r\n", b"\n"}:
                        break
                    if not line:
                        raise ValueError("Incomplete callback.")
                    key, value = line.decode("ascii").split(":", 1)
                    key = key.lower()
                    if key in headers:
                        raise ValueError("Duplicate callback header.")
                    headers[key] = value.strip()
                url = urlsplit(target)
                params = parse_qs(url.query, keep_blank_values=True)
                valid = (
                    method == "GET"
                    and version == "HTTP/1.1"
                    and url.path == "/oauth/callback"
                    and not url.scheme
                    and not url.netloc
                    and headers.get("host") == f"127.0.0.1:{self.port}"
                )
                valid = (
                    valid
                    and self.state is not None
                    and len(params.get("state", [])) == 1
                    and secrets.compare_digest(params["state"][0], self.state)
                )
                valid = (
                    valid
                    and all(
                        len(params.get(key, [])) <= 1
                        for key in ("code", "error", "iss")
                    )
                    and not self.result.done()
                )
                if not valid:
                    await self._respond(
                        writer, 400, "Invalid or expired authorization callback."
                    )
                    return
                if "error" in params:
                    self.result.set_exception(
                        OAuthDenied("Authorization was declined.")
                    )
                elif (
                    len(params.get("code", [])) == 1
                    and 0 < len(params["code"][0]) <= 8192
                ):
                    self.result.set_result(
                        AuthorizationCodeResult(
                            code=params["code"][0],
                            state=params["state"][0],
                            iss=params.get("iss", [None])[0],
                        )
                    )
                else:
                    await self._respond(writer, 400, "Missing authorization code.")
                    return
                await self._respond(
                    writer,
                    200,
                    "Authorization response received. You may close this page.",
                )
        except (ValueError, UnicodeError, TimeoutError):
            await self._respond(writer, 400, "Invalid authorization callback.")
        except OSError:
            logger.debug("OAuth callback connection closed before acknowledgement.")
        finally:
            self.handlers.discard(task)
            writer.close()
            try:
                await writer.wait_closed()
            except OSError:
                logger.debug("OAuth callback connection closed during cleanup.")

    async def _respond(self, writer, status: int, message: str) -> None:
        body = message.encode()
        writer.write(
            f"HTTP/1.1 {status} {'OK' if status == 200 else 'Bad Request'}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {len(body)}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n".encode()
            + body
        )
        await writer.drain()

    async def close(self) -> None:
        if self.server is not None:
            self.server.close()
            await self.server.wait_closed()
        for task in tuple(self.handlers):
            task.cancel()
        await asyncio.gather(*self.handlers, return_exceptions=True)
        if not self.result.done():
            self.result.cancel()
