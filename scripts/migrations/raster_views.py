"""Explicit v14 -> v15 data upgrade; no runtime support for the old raster model.

Run with the desktop app closed:
  uv run --project backend python scripts/migrations/raster_views.py /path/to/kunyu.db

The original TIFF is not rewritten. SQLite and obsolete derivatives are preserved
in the named backup directory. New view previews are generated before DB mutation.
"""

import json
import logging
import shutil
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path
from threading import Event

import rasterio
from kunyu.domain.geospatial.raster import RasterPresentation
from kunyu.integrations.geospatial.raster_manifest import prepare_manifest
from kunyu.persistence.schema import SCHEMA_PATH

logger = logging.getLogger(__name__)


def presentation_from_products(products: list[dict]) -> dict:
    bands, views = [], []
    for index, item in enumerate(products, 1):
        bands.append(
            {
                "index": index,
                "name": item["name"],
                "title": item["title"],
                "description": item["description"],
                "unit": None,
            }
        )
        style = (
            {
                "type": "classified",
                "classes": item["categories"],
                "transparent_values": item.get("transparent_values", []),
            }
            if item.get("categories")
            else {
                "type": "continuous",
                "color_ramp": "viridis",
                "stretch": {"method": "range", "ranges": [item["display_range"]]},
            }
        )
        views.append(
            {
                "id": item["name"],
                "title": item["title"],
                "description": item["description"],
                "group": item["group"],
                "bands": [index],
                "style": style,
            }
        )
    return {"bands": bands, "views": views, "default_view": views[0]["id"]}


def legacy_presentation(row: dict, metadata: dict, path: Path) -> dict:
    count = metadata["bands"]
    with rasterio.open(path) as src:
        names = list(src.descriptions)
        units = list(src.units)
    bands = [
        {
            "index": i,
            "name": name or f"band_{i}",
            "title": name or f"波段 {i}",
            "description": f"既有成果的原始第 {i} 波段；业务含义以保存的执行代码为准。",
            "unit": units[i - 1],
        }
        for i, name in enumerate(names, 1)
    ]
    if count == 3:
        style = {
            "type": "rgb",
            "stretch": {"method": "range", "ranges": metadata["display_ranges"]},
        }
    elif count == 1 and metadata.get("categories"):
        style = {
            "type": "classified",
            "classes": metadata["categories"],
            "transparent_values": metadata.get("transparent_values", []),
        }
    elif count == 1:
        style = {
            "type": "continuous",
            "color_ramp": "viridis",
            "stretch": {"method": "range", "ranges": [metadata["display_range"]]},
        }
    else:
        raise ValueError(f"Unsupported legacy raster: {row['id']}")
    return {
        "bands": bands,
        "views": [
            {
                "id": "default",
                "title": row["title"],
                "description": "保留迁移前的显示配置。",
                "group": "影像",
                "bands": list(range(1, count + 1)),
                "style": style,
            }
        ],
        "default_view": "default",
    }


def migrate(path: Path) -> dict:
    path = path.resolve(strict=True)
    root = path.parent / "workspaces"
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    if connection.execute("PRAGMA user_version").fetchone()[0] != 14:
        raise ValueError("This explicit migration requires database version 14.")
    if connection.execute(
        "SELECT count(*) FROM analysis_jobs WHERE state IN ('submitting','queued','running','collecting')"
    ).fetchone()[0]:
        raise ValueError("Settle active analysis jobs before upgrading.")
    backup = path.parent / "backups" / f"{datetime.now(UTC):%Y%m%d-%H%M%S}-raster-views"
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    with sqlite3.connect(backup / "kunyu.db") as copy:
        connection.backup(copy)
    (backup / "kunyu.db").chmod(0o600)
    rows = [dict(row) for row in connection.execute("SELECT * FROM analysis_outputs")]
    prepared, references, obsolete = {}, {}, set()
    result_files = []
    for row in rows:
        metadata = json.loads(row["raster_metadata"])
        family = metadata.get("bundle_id", row["id"])
        if family != row["id"]:
            continue
        source = json.loads(row["source_metadata"])
        if "products" in metadata:
            source_file = source["bundle_file"]
            presentation = presentation_from_products(source["parameters"]["products"])
            members = [
                item
                for item in rows
                if json.loads(item["raster_metadata"]).get("bundle_id") == family
            ]
            for member in members:
                old = json.loads(member["raster_metadata"])
                references[member["id"]] = (family, old["product_name"])
                obsolete.update((member["cog_file"], member["preview_file"]))
            source.pop("bundle_file")
            source["parameters"].pop("products")
            source["parameters"]["presentation"] = presentation
        else:
            source_file = row["cog_file"]
            presentation = legacy_presentation(row, metadata, root / source_file)
            references[row["id"]] = (row["id"], presentation["default_view"])
            obsolete.add(row["preview_file"])
        contract = RasterPresentation.model_validate(presentation)
        preview_dir = Path(row["preview_file"]).parent / "views"
        generated = prepare_manifest(
            root / source_file, root / preview_dir, contract, Event()
        )
        preview = str(preview_dir / f"{contract.default_view}.png")
        title = source.get("parameters", {}).get("title", row["title"])
        prepared[row["id"]] = {
            "metadata": generated,
            "source": source,
            "cog": source_file,
            "preview": preview,
            "title": title,
        }
    # Keep layer IDs stable, while replacing references to old child outputs.
    layers = [dict(row) for row in connection.execute("SELECT * FROM map_layers")]
    table = (
        SCHEMA_PATH.read_text()
        .split("CREATE TABLE map_layers (", 1)[1]
        .split("\n);", 1)[0]
    )
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("CREATE TABLE map_layers_new (" + table + "\n)")
        for layer in layers:
            if layer["output_id"] is not None:
                output, view = references[layer["output_id"]]
                layer["output_id"], layer["view_id"] = output, view
                layer["revision"] += 1
            else:
                layer["view_id"] = None
            keys = list(layer)
            connection.execute(
                f"INSERT INTO map_layers_new ({','.join(keys)}) VALUES ({','.join('?' for _ in keys)})",
                [layer[key] for key in keys],
            )
        connection.execute("DROP TABLE map_layers")
        connection.execute("ALTER TABLE map_layers_new RENAME TO map_layers")
        for identity, value in prepared.items():
            connection.execute(
                "UPDATE analysis_outputs SET kind='raster', title=?, raster_metadata=?, source_metadata=?, cog_file=?, preview_file=?, revision=revision+1 WHERE id=?",
                (
                    value["title"],
                    json.dumps(value["metadata"], ensure_ascii=False),
                    json.dumps(value["source"], ensure_ascii=False),
                    value["cog"],
                    value["preview"],
                    identity,
                ),
            )
        for row in rows:
            if row["id"] not in prepared:
                connection.execute(
                    "DELETE FROM analysis_outputs WHERE id=?", (row["id"],)
                )
        for job in connection.execute(
            "SELECT id,parameters FROM analysis_jobs"
        ).fetchall():
            parameters = json.loads(job["parameters"])
            if "products" in parameters:
                parameters["presentation"] = presentation_from_products(
                    parameters.pop("products")
                )
            elif job["id"] in {row["job_id"] for row in rows}:
                identity = next(row["id"] for row in rows if row["job_id"] == job["id"])
                value = prepared[identity]["metadata"]
                parameters["presentation"] = {
                    "bands": [
                        {
                            k: band[k]
                            for k in ("index", "name", "title", "description", "unit")
                        }
                        for band in value["bands"]
                    ],
                    "views": [
                        {
                            k: view[k]
                            for k in (
                                "id",
                                "title",
                                "description",
                                "group",
                                "bands",
                                "style",
                            )
                        }
                        for view in value["views"]
                    ],
                    "default_view": value["default_view"],
                }
            connection.execute(
                "UPDATE analysis_jobs SET parameters=? WHERE id=?",
                (json.dumps(parameters, ensure_ascii=False), job["id"]),
            )
        for job in connection.execute(
            "SELECT id,workspace_id,result FROM background_jobs WHERE result IS NOT NULL"
        ).fetchall():
            result = json.loads(job["result"])
            if (
                not isinstance(result, dict)
                or result.get("analysis_output_id") not in prepared
            ):
                continue
            identity = result["analysis_output_id"]
            value = prepared[identity]
            metadata = value["metadata"]
            updated = {
                "analysis_output_id": identity,
                "limitations": value["source"]
                .get("parameters", {})
                .get("limitations", []),
                "output": {
                    "id": identity,
                    "title": value["title"],
                    "file_path": "/workspace/" + value["cog"].split("/", 1)[1],
                    "preview_path": "/workspace/" + value["preview"].split("/", 1)[1],
                    "kind": "raster",
                    "metadata": metadata,
                },
            }
            raw = json.dumps(updated, ensure_ascii=False)
            connection.execute(
                "UPDATE background_jobs SET result=? WHERE id=?", (raw, job["id"])
            )
            result_files.append(
                (
                    root
                    / job["workspace_id"]
                    / ".cache/jobs"
                    / job["id"]
                    / "result.json",
                    raw,
                )
            )
        if connection.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Foreign-key check failed.")
        connection.execute("PRAGMA user_version=15")
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()
    for result_path, raw in result_files:
        if result_path.is_file():
            saved = backup / "job-results" / result_path.relative_to(root)
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(result_path, saved)
        result_path.parent.mkdir(parents=True, exist_ok=True)
        result_path.write_text(raw)
    retained = {value["cog"] for value in prepared.values()}
    for relative in sorted(obsolete - retained):
        source = root / relative
        if source.is_file():
            destination = backup / "derivatives" / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(source, destination)
    report = {
        "backup": str(backup),
        "rasters": len(prepared),
        "views": sum(len(value["metadata"]["views"]) for value in prepared.values()),
        "layers": len(layers),
        "removed_child_records": len(rows) - len(prepared),
    }
    (backup / "migration.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2)
    )
    logger.info("Raster migration complete: %s", report)
    return report


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(migrate(Path(sys.argv[1])), ensure_ascii=False, indent=2))
