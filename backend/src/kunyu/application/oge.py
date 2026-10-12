"""Human-owned OGE login and public imagery discovery services."""

import asyncio
import time
from datetime import UTC, datetime

from pydantic import JsonValue

from kunyu.domain.oge import (
    DEFAULT_OGE_BASE_URL,
    OgeAccount,
    OgeAccountStatus,
    OgeError,
    OgeImagePage,
    OgeImageRecord,
    OgeLogin,
    OgeRegionNode,
)
from kunyu.integrations.oge.client import OgeClient
from kunyu.persistence.oge import OgeAccountStore

REGION_CACHE_SECONDS = 3600


class OgeService:
    def __init__(self, client: OgeClient, accounts: OgeAccountStore) -> None:
        self._client, self._accounts = client, accounts
        self._account_lock = asyncio.Lock()
        self._region_lock = asyncio.Lock()
        self._region_cache: tuple[str, float, list[OgeRegionNode]] | None = None

    def status(self) -> OgeAccountStatus:
        account = self._accounts.read()
        if account is None:
            return OgeAccountStatus(
                state="signed_out",
                base_url=DEFAULT_OGE_BASE_URL,
                username=None,
                expires_at=None,
                updated_at=None,
            )
        return OgeAccountStatus(
            state="signed_in" if account.tokens.exp > time.time() else "expired",
            base_url=account.base_url,
            username=account.username,
            expires_at=account.tokens.exp,
            updated_at=account.updated_at,
        )

    async def login(self, request: OgeLogin) -> OgeAccountStatus:
        async with self._account_lock:
            tokens = await self._client.login(request)
            if tokens.exp <= time.time() or tokens.refreshExp <= time.time():
                raise OgeError(
                    "OGE_PROTOCOL_ERROR", "OGE returned already-expired tokens."
                )
            self._accounts.save(
                OgeAccount(
                    base_url=request.base_url,
                    username=request.username,
                    tokens=tokens,
                    updated_at=datetime.now(UTC).isoformat(),
                )
            )
            self._region_cache = None
            return self.status()

    async def logout(self) -> OgeAccountStatus:
        async with self._account_lock:
            self._accounts.clear()
            self._region_cache = None
            return self.status()

    def _base_url(self) -> str:
        account = self._accounts.read()
        return DEFAULT_OGE_BASE_URL if account is None else account.base_url

    async def search_images(self, fields: dict[str, str]) -> OgeImagePage:
        data = await self._client.json(
            self._base_url(), "POST", "/data-product/retrieval", fields=fields
        )
        return self._client.validate(OgeImagePage, data)

    async def image_detail(self, image_id: int) -> dict[str, JsonValue]:
        data = await self._client.json(
            self._base_url(),
            "GET",
            "/data-product/image/detail",
            params={"imageId": str(image_id)},
        )
        if data is None:
            raise OgeError(
                "OGE_IMAGE_NOT_FOUND", f"OGE image {image_id} does not exist.", 404
            )
        self._client.validate(OgeImageRecord, data)
        detail = self._client.validate(dict[str, JsonValue], data)
        if detail["imageId"] != image_id:
            raise OgeError(
                "OGE_PROTOCOL_ERROR", "OGE returned a different image identity."
            )
        return detail

    async def image_preview(self, image_id: int) -> bytes:
        return await self._client.preview(self._base_url(), image_id)

    async def find_regions(
        self,
        query: str,
        parent_name: str | None,
        match_mode: str,
        offset: int,
        limit: int,
    ) -> dict[str, JsonValue]:
        roots = await self._regions()
        matches: list[dict[str, JsonValue]] = []
        wanted = query.casefold()
        parent = parent_name.casefold() if parent_name is not None else None

        def visit(node: OgeRegionNode, ancestors: tuple[OgeRegionNode, ...]) -> None:
            names = (node.name.casefold(), node.nameEn.casefold())
            match = (
                wanted in names
                if match_mode == "exact"
                else any(wanted in name for name in names)
            )
            parent_matches = parent is None or any(
                parent in (item.name.casefold(), item.nameEn.casefold())
                for item in ancestors
            )
            if match and parent_matches:
                matches.append(
                    {
                        "code": node.code,
                        "level": node.level,
                        "name": node.name,
                        "name_en": node.nameEn,
                        "path": [item.name for item in (*ancestors, node)],
                    }
                )
            for child in node.children:
                visit(child, (*ancestors, node))

        for root in roots:
            visit(root, ())
        end = offset + limit
        return {
            "query": query,
            "total": len(matches),
            "offset": offset,
            "next_offset": end if end < len(matches) else None,
            "regions": matches[offset:end],
        }

    async def _regions(self) -> list[OgeRegionNode]:
        base_url = self._base_url()
        async with self._region_lock:
            cache = self._region_cache
            if (
                cache is not None
                and cache[0] == base_url
                and cache[1] > time.monotonic()
            ):
                return cache[2]
            data = await self._client.json(
                base_url, "GET", "/data-product/administrative-region/tree"
            )
            roots = self._client.validate(list[OgeRegionNode], data)
            self._region_cache = (
                base_url,
                time.monotonic() + REGION_CACHE_SECONDS,
                roots,
            )
            return roots
