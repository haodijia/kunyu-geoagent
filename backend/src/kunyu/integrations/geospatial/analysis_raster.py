"""Keep source raster values intact and render scalar/RGB map imagery."""

import math
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
from rasterio.warp import transform_bounds

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.filesystem.names import numbered_name, readable_name
from kunyu.integrations.filesystem.workspaces import validate_filename
from kunyu.integrations.geospatial.rgb_display import rgb_ranges, rgb_rgba


class AnalysisRaster:
    def __init__(self, data_directory: Path) -> None:
        self.root = data_directory / "workspaces"

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

    def prepare(self, workspace_id: str, name: str, cancelled: Event) -> dict:
        directory = self.directory(workspace_id, name)
        check_cancelled(cancelled, "prepare analysis output")
        with rasterio.open(directory / "result.tif") as src:
            scalar = src.count == 1 and np.issubdtype(
                np.dtype(src.dtypes[0]), np.integer
            )
            scalar = scalar or (
                src.count == 1 and np.issubdtype(np.dtype(src.dtypes[0]), np.floating)
            )
            rgb = src.count == 3 and set(src.dtypes) <= {"uint8", "uint16"}
            if src.crs is None or not (scalar or rgb):
                raise AnalysisError(
                    "UNSUPPORTED_RASTER",
                    "Map rendering requires a georeferenced numeric single band or three-band uint8/uint16 RGB raster.",
                )
            bounds = list(transform_bounds(src.crs, "EPSG:4326", *src.bounds))
            if not all(math.isfinite(value) for value in bounds):
                raise AnalysisError(
                    "INVALID_RASTER_BOUNDS", "Raster bounds are not finite."
                )
            data = src.read(
                out_shape=(src.count, 512, 512),
                masked=True,
                resampling=Resampling.nearest,
            )
            limits = None
            color_limits = None
            if scalar:
                valid = data[0].compressed()
                valid = valid[np.isfinite(valid)]
                if not len(valid):
                    raise AnalysisError(
                        "EMPTY_RASTER", "The raster preview contains no finite values."
                    )
                limits = [
                    float(np.percentile(valid, 2)),
                    float(np.percentile(valid, 98)),
                ]
                if limits[0] == limits[1]:
                    limits[1] = limits[0] + max(1, abs(limits[0]) * 0.01)
                rgba = _scalar_rgba(data[0], *limits)
            else:
                color_limits = (
                    [[0.0, 255.0]] * 3
                    if set(src.dtypes) == {"uint8"}
                    else rgb_ranges(data)
                )
                rgba = rgb_rgba(
                    data, src.dataset_mask(out_shape=(512, 512)), color_limits
                )
            metadata = {
                "width": src.width,
                "height": src.height,
                "bands": src.count,
                "dtypes": list(src.dtypes),
                "crs": str(src.crs),
                "bounds": bounds,
                "nodata": src.nodata
                if src.nodata is not None and math.isfinite(src.nodata)
                else None,
                "display_kind": "scalar" if scalar else "rgb",
                "display_range": limits,
                "display_ranges": color_limits,
                "palette": "viridis" if scalar else None,
                "numeric_values_available": scalar,
            }
        check_cancelled(cancelled, "publish analysis preview")
        preview = self.preview_path(workspace_id, name)
        preview.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        Image.fromarray(rgba).save(preview)
        return metadata

    def tile(self, relative: str, z: int, x: int, y: int, metadata: dict) -> bytes:
        if z < 0 or z > 24 or x < 0 or y < 0 or x >= 2**z or y >= 2**z:
            raise AnalysisError("INVALID_TILE", "Invalid tile coordinates.", 422)
        limits = metadata["display_range"]
        color_limits = (
            metadata["display_ranges"] if metadata["display_kind"] == "rgb" else None
        )
        return _render_tile(
            self.path(relative),
            z,
            x,
            y,
            None if limits is None else tuple(limits),
            None
            if color_limits is None
            else tuple(tuple(band) for band in color_limits),
        )


@lru_cache(maxsize=128)
def _render_tile(
    path: Path,
    z: int,
    x: int,
    y: int,
    limits: tuple | None,
    color_limits: tuple | None,
) -> bytes:
    size = 256
    unit = 20037508.342789244
    span = 2 * unit / (2**z)
    bounds = (
        -unit + x * span,
        unit - (y + 1) * span,
        -unit + (x + 1) * span,
        unit - y * span,
    )
    transform = from_bounds(*bounds, size, size)
    with (
        rasterio.open(path) as src,
        WarpedVRT(
            src,
            crs="EPSG:3857",
            transform=transform,
            width=size,
            height=size,
            add_alpha=True,
            resampling=Resampling.nearest,
        ) as vrt,
    ):
        if limits is None:
            rgba = rgb_rgba(
                vrt.read(indexes=(1, 2, 3), masked=True),
                vrt.read(vrt.count),
                color_limits,
            )
        else:
            band = vrt.read(1, masked=True)
            rgba = _scalar_rgba(band, *limits)
            rgba[:, :, 3] = np.minimum(
                rgba[:, :, 3], (vrt.read(vrt.count) > 0).astype("uint8") * 255
            )
    out = BytesIO()
    Image.fromarray(rgba).save(out, format="PNG")
    return out.getvalue()


def _scalar_rgba(data, minimum: float, maximum: float):
    values = data.astype("float64").filled(np.nan)
    valid = ~np.ma.getmaskarray(data) & np.isfinite(values)
    normalized = np.clip(
        (np.where(valid, values, minimum) - minimum) / (maximum - minimum), 0, 1
    )
    stops = np.array(
        [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]]
    )
    positions = np.linspace(0, 1, len(stops))
    rgb = np.stack(
        [np.interp(normalized, positions, stops[:, channel]) for channel in range(3)],
        axis=-1,
    ).astype("uint8")
    return np.dstack((rgb, valid.astype("uint8") * 255))
