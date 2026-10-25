"""Keep source raster values intact and render scalar/RGB map imagery."""

import json
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from threading import Event

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.vrt import WarpedVRT

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.integrations.filesystem.names import numbered_name, readable_name
from kunyu.integrations.filesystem.workspaces import validate_filename


class AnalysisRaster:
    def __init__(self, data_directory: Path) -> None:
        self.root = (data_directory / "workspaces").resolve()

    def directory(self, workspace_id: str, name: str) -> Path:
        if not workspace_id.startswith("ws_") or any(
            char not in "abcdefghijklmnopqrstuvwxyz0123456789_-"
            for char in workspace_id
        ):
            raise AnalysisError("INVALID_WORKSPACE_ID", "Invalid workspace identity.")
        validate_filename(name)
        return self.root / workspace_id / "results" / name

    def reserve(self, workspace_id: str, title: str) -> str:
        try:
            name = readable_name(title)
        except ValueError as error:
            raise AnalysisError("INVALID_OUTPUT_NAME", str(error), 422) from error
        index = 1
        while True:
            candidate = numbered_name(name, index)
            directory = self.directory(workspace_id, candidate)
            directory.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            try:
                directory.mkdir(mode=0o700)
                return candidate
            except FileExistsError:
                index += 1

    def preview_path(self, workspace_id: str, name: str) -> Path:
        self.directory(workspace_id, name)
        return self.root / workspace_id / ".cache" / "results" / name / "preview.png"

    def path(self, relative: str) -> Path:
        path = (self.root / relative).resolve()
        if self.root.resolve() not in path.parents or not path.is_file():
            raise AnalysisError(
                "ANALYSIS_FILE_MISSING", "The saved analysis file is unavailable.", 503
            )
        return path

    def prepare(
        self, workspace_id: str, name: str, presentation, cancelled: Event
    ) -> dict:
        from kunyu.integrations.geospatial.raster_manifest import prepare_manifest

        return prepare_manifest(
            self.directory(workspace_id, name) / "result.tif",
            self.preview_path(workspace_id, name).parent / "views",
            presentation,
            cancelled,
        )

    def tile(self, relative: str, z: int, x: int, y: int, view: dict) -> bytes:
        if z < 0 or z > 24 or x < 0 or y < 0 or x >= 2**z or y >= 2**z:
            raise AnalysisError("INVALID_TILE", "Invalid tile coordinates.", 422)
        return _render_tile(
            self.path(relative), z, x, y, json.dumps(view, sort_keys=True)
        )


@lru_cache(maxsize=128)
def _render_tile(path: Path, z: int, x: int, y: int, view_json: str) -> bytes:
    from kunyu.integrations.geospatial.raster_display import render_rgba

    view = json.loads(view_json)
    size = 256
    unit = 20037508.342789244
    span = 2 * unit / (2**z)
    bounds = (
        -unit + x * span,
        unit - (y + 1) * span,
        -unit + (x + 1) * span,
        unit - y * span,
    )
    with (
        rasterio.open(path) as src,
        WarpedVRT(
            src,
            crs="EPSG:3857",
            transform=from_bounds(*bounds, size, size),
            width=size,
            height=size,
            add_alpha=True,
            resampling=Resampling.nearest,
        ) as vrt,
    ):
        data = vrt.read(indexes=view["bands"], masked=True)
        data = np.ma.array(
            data, mask=np.ma.getmaskarray(data) | (vrt.read(vrt.count) == 0)[None, :, :]
        )
        rgba = render_rgba(data, view["style"], view["render_ranges"])
    out = BytesIO()
    Image.fromarray(rgba).save(out, format="PNG")
    return out.getvalue()
