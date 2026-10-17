"""One durable OGE login shared by discovery, execution and background reads."""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from kunyu.domain.geospatial.oge import OgeAccount, OgeError, OgeLogin
from kunyu.integrations.oge.client import OgeClient
from kunyu.persistence.geospatial.oge import OgeAccountStore

logger = logging.getLogger(__name__)
RENEW_MARGIN_SECONDS = 60


class OgeAuth:
    def __init__(self, client: OgeClient, accounts: OgeAccountStore) -> None:
        self._client, self._accounts = client, accounts
        self._lock = asyncio.Lock()

    def read(self) -> OgeAccount | None:
        return self._accounts.read()

    async def login(self, request: OgeLogin) -> OgeAccount:
        async with self._lock:
            return await self._login(request)

    async def _login(self, request: OgeLogin) -> OgeAccount:
        tokens = await self._client.login(request)
        if tokens.exp <= time.time() or tokens.refreshExp <= time.time():
            raise OgeError("OGE_PROTOCOL_ERROR", "OGE returned already-expired tokens.")
        account = OgeAccount(
            base_url=request.base_url,
            username=request.username,
            password=request.password,
            tokens=tokens,
            updated_at=datetime.now(UTC).isoformat(),
        )
        self._accounts.save(account)
        return account

    async def logout(self) -> None:
        async with self._lock:
            self._accounts.clear()

    async def account(self, rejected: OgeAccount | None = None) -> OgeAccount:
        async with self._lock:
            account = self._accounts.read()
            if account is None:
                raise OgeError("OGE_AUTH_REQUIRED", "Log in to OGE in settings.", 401)
            if rejected is not None and (account.username, account.base_url) != (
                rejected.username,
                rejected.base_url,
            ):
                raise OgeError(
                    "OGE_ACCOUNT_CHANGED",
                    "The OGE account changed during the request.",
                    409,
                )
            if account.reauth_required:
                raise OgeError(
                    "OGE_AUTH_REJECTED", "Update the OGE credentials in settings.", 401
                )
            rejected_current = (
                rejected is not None and account.tokens.token == rejected.tokens.token
            )
            if (
                not rejected_current
                and account.tokens.exp > time.time() + RENEW_MARGIN_SECONDS
            ):
                return account
            if account.password is None:
                raise OgeError(
                    "OGE_AUTH_EXPIRED",
                    "Sign in once to save OGE credentials for automatic reconnection.",
                    401,
                )
            logger.info("Renewing the OGE login.")
            try:
                return await self._login(
                    OgeLogin(
                        base_url=account.base_url,
                        username=account.username,
                        password=account.password,
                    )
                )
            except OgeError as error:
                logger.warning("OGE reconnection failed (%s).", error.code)
                if error.code == "OGE_AUTH_REJECTED":
                    self._accounts.save(
                        account.model_copy(update={"reauth_required": True})
                    )
                raise

    async def run[T](self, operation: Callable[[OgeAccount], Awaitable[T]]) -> T:
        account = await self.account()
        try:
            return await operation(account)
        except OgeError as error:
            if error.code != "OGE_AUTH_REJECTED":
                raise
        logger.info("OGE rejected the token; reconnecting before one retry.")
        renewed = await self.account(rejected=account)
        try:
            return await operation(renewed)
        except OgeError as error:
            if error.code == "OGE_AUTH_REJECTED":
                async with self._lock:
                    current = self._accounts.read()
                    if (
                        current is not None
                        and current.tokens.token == renewed.tokens.token
                    ):
                        self._accounts.save(
                            current.model_copy(update={"reauth_required": True})
                        )
            raise
