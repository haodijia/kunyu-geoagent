"""One session transport owns and drains independent native file watchers."""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator, AsyncIterator
from dataclasses import asdict

from anyio import CancelScope, create_task_group
from starlette.responses import StreamingResponse
from starlette.types import Receive, Scope, Send

from kunyu.domain.filesystem import FilesystemError, FsWatchFrame

logger = logging.getLogger(__name__)


def frame(kind: str, value: dict) -> str:
    return f"event: file.{kind}\ndata: {json.dumps(value, ensure_ascii=False, allow_nan=False)}\n\n"


class FileWatchResponse(StreamingResponse):
    def __init__(
        self,
        session_id: str,
        sources: dict[str, AsyncGenerator[FsWatchFrame, None]],
    ) -> None:
        self._sources = sources
        self._session_id = session_id
        self._queue: asyncio.Queue[str | None] = asyncio.Queue(maxsize=128)

        async def content() -> AsyncIterator[str]:
            remaining = len(sources)
            while remaining:
                item = await self._queue.get()
                if item is None:
                    remaining -= 1
                else:
                    yield item

        super().__init__(
            content(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )

    async def _pump(
        self, path: str, source: AsyncGenerator[FsWatchFrame, None]
    ) -> None:
        try:
            async for item in source:
                await self._queue.put(frame(item.kind, asdict(item)))
        except Exception as error:
            logger.exception(
                "File watch failed for session %s, path %s", self._session_id, path
            )
            code = (
                error.code if isinstance(error, FilesystemError) else "FS_WATCH_FAILED"
            )
            await self._queue.put(
                frame(
                    "error",
                    {
                        "kind": "error",
                        "path": path,
                        "code": code,
                        "message": str(error),
                    },
                )
            )
        finally:
            with CancelScope(shield=True):
                await source.aclose()
        await self._queue.put(None)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            async with create_task_group() as tasks:

                async def stream() -> None:
                    await self.stream_response(send)
                    tasks.cancel_scope.cancel()

                for path, source in self._sources.items():
                    tasks.start_soon(self._pump, path, source)
                tasks.start_soon(stream)
                await self.listen_for_disconnect(receive)
                tasks.cancel_scope.cancel()
        finally:
            with CancelScope(shield=True):
                await self.body_iterator.aclose()
                for source in self._sources.values():
                    await source.aclose()
