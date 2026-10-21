"""Request an on-demand map image from the connected UI, without database state."""

import asyncio
import time
from collections.abc import Callable
from dataclasses import dataclass
from itertools import count

from kunyu.domain.geospatial.map_status import MapRenderStatus


class MapCaptureError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


@dataclass(slots=True)
class _Capture:
    session_id: str
    client_id: int
    future: asyncio.Future[bytes]


class MapCaptureService:
    def __init__(self) -> None:
        self._clients: dict[str, dict[int, Callable[[str], None]]] = {}
        self._pending: dict[str, _Capture] = {}
        self._identities = count()
        self._statuses: dict[tuple[str, str], tuple[float, MapRenderStatus]] = {}

    def report_status(
        self, session_id: str, client_id: str, value: MapRenderStatus
    ) -> None:
        self._statuses = {
            key: value
            for key, value in self._statuses.items()
            if time.monotonic() - value[0] < 30
        }
        key = (session_id, client_id)
        if value.state == "closed":
            self._statuses.pop(key, None)
        else:
            self._statuses[key] = (time.monotonic(), value)

    def status(self, session_id: str) -> dict:
        active = [
            value
            for (session, _), value in self._statuses.items()
            if session == session_id and time.monotonic() - value[0] < 30
        ]
        if not active:
            return {
                "state": "unavailable",
                "layers": [],
                "error": "No recent rendering report from an open map.",
            }
        return max(active, key=lambda value: value[0])[1].model_dump(mode="json")

    def subscribe(
        self, session_id: str, notify: Callable[[str], None]
    ) -> Callable[[], None]:
        identity = next(self._identities)
        self._clients.setdefault(session_id, {})[identity] = notify

        def unsubscribe() -> None:
            clients = self._clients[session_id]
            del clients[identity]
            if not clients:
                del self._clients[session_id]
            for capture in self._pending.values():
                if capture.client_id == identity and not capture.future.done():
                    capture.future.set_exception(
                        MapCaptureError(
                            "MAP_VIEW_DISCONNECTED",
                            "The map client disconnected during capture.",
                        )
                    )

        return unsubscribe

    async def capture(self, session_id: str, request_id: str) -> bytes:
        clients = self._clients.get(session_id)
        if not clients:
            raise MapCaptureError(
                "MAP_VIEW_UNAVAILABLE",
                "Open this session's map before requesting a screenshot.",
            )
        if request_id in self._pending:
            raise RuntimeError("A map capture is already pending for this tool call.")
        identity = next(reversed(clients))
        future = asyncio.get_running_loop().create_future()
        self._pending[request_id] = _Capture(session_id, identity, future)
        try:
            clients[identity](request_id)
            async with asyncio.timeout(15):
                return await future
        except TimeoutError as error:
            raise MapCaptureError(
                "MAP_CAPTURE_TIMEOUT",
                "The map client did not provide a screenshot within 15 seconds.",
            ) from error
        finally:
            del self._pending[request_id]
            if not future.done():
                future.cancel()

    def complete(
        self, session_id: str, request_id: str, result: bytes | MapCaptureError
    ) -> None:
        capture = self.require_pending(session_id, request_id)
        if isinstance(result, MapCaptureError):
            capture.future.set_exception(result)
        else:
            capture.future.set_result(result)

    def require_pending(self, session_id: str, request_id: str) -> _Capture:
        capture = self._pending.get(request_id)
        if capture is None or capture.session_id != session_id or capture.future.done():
            raise MapCaptureError(
                "MAP_CAPTURE_EXPIRED",
                "This map capture is no longer pending in this session.",
            )
        return capture
