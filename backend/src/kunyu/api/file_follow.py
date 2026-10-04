"""A file watch response owns its generation even before body iteration begins."""

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
        iterator: AsyncGenerator[FsWatchFrame, None],
        first: FsWatchFrame,
    ) -> None:
        self._iterator = iterator

        async def content() -> AsyncIterator[str]:
            yield frame(first.kind, asdict(first))
            try:
                async for item in iterator:
                    yield frame(item.kind, asdict(item))
            except Exception as error:
                logger.exception(
                    "File watch failed for session %s, path %s", session_id, first.path
                )
                code = (
                    error.code
                    if isinstance(error, FilesystemError)
                    else "FS_WATCH_FAILED"
                )
                yield frame("error", {"code": code, "message": str(error)})

        super().__init__(
            content(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            async with create_task_group() as tasks:

                async def stream() -> None:
                    await self.stream_response(send)
                    tasks.cancel_scope.cancel()

                tasks.start_soon(stream)
                await self.listen_for_disconnect(receive)
                tasks.cancel_scope.cancel()
        finally:
            with CancelScope(shield=True):
                await self._iterator.aclose()
