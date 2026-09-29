import os
import socket
import sys
from collections.abc import Callable
from types import FrameType
from typing import Literal

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

from kunyu.settings import API_VERSION, DESKTOP_HOST, DESKTOP_PORT, SESSION_TOKEN_ENV


class DesktopConfigurationError(RuntimeError):
    pass


class ReadyMessage(BaseModel):
    type: Literal["ready"] = "ready"
    host: str
    port: int
    pid: int
    api_version: Literal["1"] = API_VERSION


class DesktopServer(uvicorn.Server):
    def __init__(
        self,
        config: uvicorn.Config,
        ready_message: ReadyMessage,
        begin_shutdown: Callable[[], None],
    ) -> None:
        super().__init__(config)
        self._ready_message = ready_message
        self._begin_shutdown = begin_shutdown
        self._ready_emitted = False

    async def startup(self, sockets: list[socket.socket] | None = None) -> None:
        await super().startup(sockets=sockets)
        if self.should_exit or self._ready_emitted:
            return

        sys.stdout.write(f"{self._ready_message.model_dump_json()}\n")
        sys.stdout.flush()
        self._ready_emitted = True

    def handle_exit(self, sig: int, frame: FrameType | None) -> None:
        self._begin_shutdown()
        super().handle_exit(sig, frame)


def run_desktop(app_factory: Callable[[str], FastAPI]) -> None:
    session_token = os.environ.get(SESSION_TOKEN_ENV)
    if not session_token:
        raise DesktopConfigurationError(
            f"{SESSION_TOKEN_ENV} is required in desktop mode."
        )

    app = app_factory(session_token)
    ready_message = ReadyMessage(
        host=DESKTOP_HOST,
        port=DESKTOP_PORT,
        pid=os.getpid(),
    )
    config = uvicorn.Config(
        app,
        host=DESKTOP_HOST,
        port=DESKTOP_PORT,
        access_log=False,
    )

    def begin_shutdown() -> None:
        scheduler = getattr(app.state, "run_scheduler", None)
        if scheduler is not None:
            scheduler.begin_shutdown()

    server = DesktopServer(config, ready_message, begin_shutdown)

    def request_shutdown() -> None:
        begin_shutdown()
        server.should_exit = True

    app.state.shutdown_callback = request_shutdown
    server.run()
