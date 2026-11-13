"""One-use OAuth result owned by the application HTTP callback."""

import asyncio
import secrets

from mcp.shared.auth import AuthorizationCodeResult
from starlette.datastructures import QueryParams


class OAuthDenied(RuntimeError):
    pass


class OAuthCallback:
    def __init__(self) -> None:
        self.result = asyncio.get_running_loop().create_future()
        self.state: str | None = None

    def accept(self, params: QueryParams) -> bool:
        states = params.getlist("state")
        if (
            self.state is None
            or self.result.done()
            or len(states) != 1
            or not secrets.compare_digest(states[0].encode(), self.state.encode())
            or any(len(params.getlist(key)) > 1 for key in ("code", "error", "iss"))
        ):
            return False
        if params.get("error"):
            self.result.set_exception(OAuthDenied("Authorization was declined."))
        elif params.get("code") and len(params["code"]) <= 8192:
            self.result.set_result(
                AuthorizationCodeResult(
                    code=params["code"], state=states[0], iss=params.get("iss")
                )
            )
        else:
            return False
        self.state = None
        return True

    async def close(self) -> None:
        self.state = None
        if not self.result.done():
            self.result.cancel()
