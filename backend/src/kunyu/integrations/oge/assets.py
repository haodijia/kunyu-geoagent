"""Explicit personal-asset transfers; mutations are never retried automatically."""

import logging
from pathlib import Path

import httpx

from kunyu.domain.geospatial.oge import OgeError
from kunyu.integrations.oge.auth import OgeAuth
from kunyu.integrations.oge.client import OgeClient

logger = logging.getLogger(__name__)


class OgeAssets:
    def __init__(self, http: httpx.AsyncClient, auth: OgeAuth) -> None:
        self.http, self.auth = http, auth

    async def upload(
        self, path: Path, *, name: str, acquired_at: str, area: str, resolution: float
    ) -> None:
        client = OgeClient(self.http)
        duplicate = await self.auth.run(
            lambda account: client.json(
                account.base_url,
                "GET",
                "/asset/myData/checkDuplicate",
                params={"assetType": "myData", "assetName": name + ".tif"},
                token=account.tokens.token,
            )
        )
        if not isinstance(duplicate, dict) or not isinstance(
            duplicate.get("hasDuplicate"), bool
        ):
            raise OgeError("OGE_PROTOCOL_ERROR", "Invalid duplicate-check response.")
        if duplicate["hasDuplicate"]:
            raise OgeError(
                "OGE_ASSET_EXISTS", "An asset with this filename already exists.", 409
            )
        account = await self.auth.account()
        with path.open("rb") as stream:
            response = await self.http.post(
                account.base_url + "/asset/myData/upload",
                headers={
                    "Authorization": "Bearer " + account.tokens.token.get_secret_value()
                },
                files={"file": (name + ".tif", stream, "image/tiff")},
                data={
                    "assetName": name,
                    "assetType": "myData",
                    "dataType": "grid",
                    "phenomenonTime": acquired_at,
                    "belongingArea": area,
                    "productLevel": "L2A",
                    "productResolution": str(resolution),
                },
                timeout=httpx.Timeout(600, connect=15),
                follow_redirects=False,
            )
        if not response.is_success:
            raise OgeError(
                "OGE_UPLOAD_UNCONFIRMED",
                f"Upload returned HTTP {response.status_code}; inspect the asset list before repeating.",
            )
        result = client._envelope(response)
        if result is not True:
            raise OgeError(
                "OGE_UPLOAD_UNCONFIRMED",
                "Upload was not confirmed; inspect the asset list before repeating.",
            )
        logger.info("Uploaded OGE asset %s (%s bytes)", name, path.stat().st_size)

    async def download(
        self, asset_uuid: str, destination: Path, expected_bytes: int
    ) -> None:
        if destination.exists():
            raise FileExistsError(destination)
        account = await self.auth.account()
        partial = destination.with_suffix(destination.suffix + ".part")
        destination.parent.mkdir(parents=True, exist_ok=True)
        size = 0
        try:
            async with self.http.stream(
                "GET",
                account.base_url + "/asset/myData/download",
                params={"assetUuid": asset_uuid},
                headers={
                    "Authorization": "Bearer " + account.tokens.token.get_secret_value()
                },
                timeout=httpx.Timeout(120, connect=15),
                follow_redirects=False,
            ) as response:
                response.raise_for_status()
                if "json" in response.headers.get("content-type", ""):
                    raise OgeError(
                        "OGE_DOWNLOAD_FAILED", "Personal-asset download returned JSON."
                    )
                with partial.open("xb") as stream:
                    async for chunk in response.aiter_bytes(1024 * 1024):
                        if size == 0 and chunk[:4] not in {
                            b"II*\x00",
                            b"MM\x00*",
                            b"II+\x00",
                            b"MM\x00+",
                        }:
                            raise OgeError(
                                "OGE_DOWNLOAD_FAILED",
                                "Personal-asset download is not a GeoTIFF.",
                            )
                        size += len(chunk)
                        if size > expected_bytes:
                            raise OgeError(
                                "OGE_DOWNLOAD_FAILED", "Download exceeds declared size."
                            )
                        stream.write(chunk)
            if size != expected_bytes:
                raise OgeError(
                    "OGE_DOWNLOAD_FAILED", "Personal-asset download is incomplete."
                )
            partial.rename(destination)
        except Exception:
            logger.exception("Personal-asset download failed: %s", asset_uuid)
            raise

    async def delete(self, asset_uuid: str) -> None:
        account = await self.auth.account()
        response = await self.http.get(
            account.base_url + "/asset/myData/delete",
            params={"assetUuid": asset_uuid},
            headers={
                "Authorization": "Bearer " + account.tokens.token.get_secret_value()
            },
            timeout=30,
            follow_redirects=False,
        )
        response.raise_for_status()
        result = OgeClient._envelope(response)
        if result is not True:
            raise OgeError(
                "OGE_DELETE_UNCONFIRMED", "Asset deletion was not confirmed."
            )
        logger.info("Deleted replaced OGE asset %s", asset_uuid)
