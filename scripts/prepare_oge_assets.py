"""Download, crop and upload explicitly listed personal assets with durable receipts."""

import argparse
import asyncio
import json
import os
from pathlib import Path

import httpx
from kunyu.domain.geospatial.oge import OgeAssetRecord
from kunyu.integrations.filesystem.workspaces import validate_filename
from kunyu.integrations.geospatial.raster_preparation import crop_raster
from kunyu.integrations.oge.assets import OgeAssets
from kunyu.integrations.oge.auth import OgeAuth
from kunyu.integrations.oge.client import OgeClient
from kunyu.persistence.database import Database
from kunyu.persistence.geospatial.oge import OgeAccountStore


def save(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    temporary.replace(path)


async def transfer(args, assets: list[OgeAssetRecord]) -> None:
    os.environ["KUNYU_APP_DATA_DIR"] = str(
        args.data_directory.expanduser().resolve(strict=True)
    )
    database = Database.open()
    try:
        async with httpx.AsyncClient(follow_redirects=False) as http:
            auth = OgeAuth(OgeClient(http), OgeAccountStore(database))
            service = OgeAssets(http, auth)
            if args.action == "download":
                for asset in assets:
                    name = asset.assetName + "." + asset.assetExt
                    validate_filename(name)
                    await service.download(
                        asset.assetUuid,
                        args.directory / "originals" / name,
                        asset.assetSize,
                    )
                    print(f"Downloaded {name}: {asset.assetSize} bytes", flush=True)
                return
            receipt_path = args.directory / "replacement-assets.json"
            if receipt_path.exists():
                raise FileExistsError(
                    "A receipt already exists. Inspect and reconcile it before submitting new uploads."
                )
            prepared = json.loads((args.directory / "crop-manifest.json").read_text())
            if len(prepared) != len(assets) or {
                item["source_file"] for item in prepared
            } != {a.assetName + "." + a.assetExt for a in assets}:
                raise ValueError(
                    "The crop manifest must cover every selected source exactly once"
                )
            receipts = []
            for item in prepared:
                validate_filename(item["file"])
                path = args.directory / "cropped" / item["file"]
                if path.stat().st_size != item["size_bytes"]:
                    raise ValueError("Prepared file size changed: " + path.name)
                original = next(
                    asset
                    for asset in assets
                    if asset.assetName + "." + asset.assetExt == item["source_file"]
                )
                if (
                    original.phenomenonTime is None
                    or original.productResolution is None
                    or original.belongingArea is None
                ):
                    raise ValueError(
                        "Source acquisition date, resolution and area are required"
                    )
                record = {
                    "filename": path.name,
                    "old_asset_uuid": original.assetUuid,
                    "state": "submitting",
                    "size_bytes": path.stat().st_size,
                }
                receipts.append(record)
                save(receipt_path, receipts)
                try:
                    await service.upload(
                        path,
                        name=path.stem,
                        acquired_at=original.phenomenonTime,
                        area=original.belongingArea,
                        resolution=original.productResolution,
                    )
                except Exception as error:
                    record.update(state="unconfirmed", error=str(error))
                    save(receipt_path, receipts)
                    raise
                listing = await auth.run(
                    lambda account: OgeClient(http).json(
                        account.base_url,
                        "POST",
                        "/asset/myData/list",
                        body={
                            "pageNumber": 1,
                            "pageSize": 100,
                            "keywords": path.stem,
                            "dataType": "grid",
                        },
                        token=account.tokens.token,
                    )
                )
                matches = [
                    a
                    for a in listing["records"]
                    if a["assetName"] == path.stem
                    and a["assetSize"] == path.stat().st_size
                ]
                if len(matches) != 1:
                    raise ValueError(
                        "Uploaded asset identity and size could not be confirmed"
                    )
                record.update(state="uploaded", asset_uuid=matches[0]["assetUuid"])
                save(receipt_path, receipts)
                print(f"Uploaded {path.name}: {record['asset_uuid']}", flush=True)
    finally:
        database.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["download", "crop", "upload"])
    parser.add_argument(
        "--manifest",
        type=Path,
        required=True,
        help="JSON array of explicit OGE asset records",
    )
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument(
        "--data-directory",
        type=Path,
        help="Business directory containing the signed-in OGE account",
    )
    parser.add_argument(
        "--aoi", type=Path, help="WGS84 GeoJSON Polygon/MultiPolygon or Feature"
    )
    parser.add_argument("--suffix", help="Readable crop suffix, for example yujiang_v1")
    args = parser.parse_args()
    assets = [
        OgeAssetRecord.model_validate(value)
        for value in json.loads(args.manifest.read_text())
    ]
    if not assets or len({a.assetUuid for a in assets}) != len(assets):
        parser.error("List distinct assets explicitly")
    if any(
        a.dataType != "grid" or a.assetExt.lower() not in {"tif", "tiff"}
        for a in assets
    ):
        parser.error("Only GeoTIFF grid assets are accepted")
    args.directory.mkdir(parents=True, exist_ok=True)
    if args.action != "crop":
        if args.data_directory is None:
            parser.error("--data-directory is required for authenticated transfers")
        asyncio.run(transfer(args, assets))
        return
    if args.aoi is None or not args.suffix:
        parser.error("--aoi and --suffix are required for native-grid cropping")
    validate_filename(args.suffix)
    geometry = json.loads(args.aoi.read_text())
    if geometry.get("type") == "Feature":
        geometry = geometry["geometry"]
    manifest = []
    for asset in assets:
        source_name = asset.assetName + "." + asset.assetExt
        validate_filename(source_name)
        source = args.directory / "originals" / source_name
        if source.stat().st_size != asset.assetSize:
            raise ValueError("Original size differs from the source manifest")
        result = crop_raster(
            source,
            args.directory / "cropped" / f"{asset.assetName}_{args.suffix}.tif",
            geometry,
        )
        result["source_file"] = source_name
        manifest.append(result)
        save(args.directory / "crop-manifest.json", manifest)
        print(f"Cropped {result['file']}: {result['size_bytes']} bytes", flush=True)


if __name__ == "__main__":
    main()
