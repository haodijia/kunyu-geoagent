"""Human-owned OGE login, public imagery and personal asset discovery."""

import asyncio
import logging
import time

from pydantic import JsonValue

from kunyu.domain.geospatial.oge import (
    DEFAULT_OGE_BASE_URL,
    OgeAccountStatus,
    OgeAssetPage,
    OgeAssetRecord,
    OgeError,
    OgeImagePage,
    OgeImageRecord,
    OgeLogin,
    OgeRegionNode,
)
from kunyu.integrations.oge.auth import OgeAuth
from kunyu.integrations.oge.client import OgeClient
from kunyu.persistence.geospatial.oge import OgeAccountStore

REGION_CACHE_SECONDS = 3600
logger = logging.getLogger(__name__)


class OgeService:
    def __init__(self, client: OgeClient, accounts: OgeAccountStore) -> None:
        self._client = client
        self.auth = OgeAuth(client, accounts)
        self._region_lock = asyncio.Lock()
        self._region_cache: tuple[str, float, list[OgeRegionNode]] | None = None

    async def status(self) -> OgeAccountStatus:
        account = self.auth.read()
        if (
            account is not None
            and account.password is not None
            and not account.reauth_required
        ):
            try:
                account = await self.auth.account()
            except OgeError as error:
                if error.code != "OGE_AUTH_REJECTED":
                    raise
                account = self.auth.read()
        if account is None:
            return OgeAccountStatus(
                state="signed_out",
                base_url=DEFAULT_OGE_BASE_URL,
                username=None,
                expires_at=None,
                updated_at=None,
            )
        return OgeAccountStatus(
            state="signed_in"
            if not account.reauth_required and account.tokens.exp > time.time()
            else "expired",
            base_url=account.base_url,
            username=account.username,
            expires_at=account.tokens.exp,
            updated_at=account.updated_at,
        )

    async def login(self, request: OgeLogin) -> OgeAccountStatus:
        await self.auth.login(request)
        self._region_cache = None
        return await self.status()

    async def logout(self) -> OgeAccountStatus:
        await self.auth.logout()
        self._region_cache = None
        return await self.status()

    def _base_url(self) -> str:
        account = self.auth.read()
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

    async def list_my_data(self, body: dict[str, JsonValue]) -> OgeAssetPage:
        data = await self.auth.run(
            lambda account: self._client.json(
                account.base_url,
                "POST",
                "/asset/myData/list",
                body=body,
                token=account.tokens.token,
            )
        )
        return self._client.validate(OgeAssetPage, data)

    async def my_data_detail(self, asset_uuid: str) -> dict[str, JsonValue]:
        data = await self.auth.run(
            lambda account: self._client.json(
                account.base_url,
                "GET",
                "/asset/myData/detail",
                params={"assetUuid": asset_uuid},
                token=account.tokens.token,
            )
        )
        if data is None:
            raise OgeError(
                "OGE_ASSET_NOT_FOUND", f"OGE asset {asset_uuid} does not exist.", 404
            )
        record = self._client.validate(OgeAssetRecord, data)
        if record.assetUuid.lower() != asset_uuid.lower():
            logger.warning("OGE returned a different personal asset identity.")
            raise OgeError(
                "OGE_PROTOCOL_ERROR", "OGE returned a different asset identity."
            )
        detail = self._client.validate(dict[str, JsonValue], data)
        detail["reference"] = f"Personal:Asset:{record.assetUuid}"
        return detail

    async def find_regions(
        self,
        query: str,
        parent_name: str | None,
    ) -> list[dict[str, JsonValue]]:
        roots = await self._regions()
        matches: list[dict[str, JsonValue]] = []
        wanted = query.casefold()
        parent = parent_name.casefold() if parent_name is not None else None

        def visit(node: OgeRegionNode, ancestors: tuple[OgeRegionNode, ...]) -> None:
            names = (node.name.casefold(), node.nameEn.casefold())
            match = any(wanted in name for name in names)
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
        return matches

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
