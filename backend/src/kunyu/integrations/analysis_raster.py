"""Render verified RGB GeoTIFFs as previews and Web Mercator tiles."""

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

from kunyu.domain.analysis import AnalysisError
from kunyu.integrations.filesystem_io import check_cancelled


class AnalysisRaster:
    def __init__(self, data_directory: Path) -> None:
        self.root = data_directory / "analysis-results"

    def directory(self, output_id: str) -> Path:
        if not output_id.startswith("out_") or any(
            char not in "abcdefghijklmnopqrstuvwxyz0123456789_-" for char in output_id
        ):
            raise AnalysisError("INVALID_OUTPUT_ID", "Invalid output identity.")
        path = self.root / output_id
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
        return path

    def path(self, relative: str) -> Path:
        path = (self.root / relative).resolve()
        if self.root.resolve() not in path.parents or not path.is_file():
            raise AnalysisError(
                "ANALYSIS_FILE_MISSING", "The saved analysis file is unavailable.", 503
            )
        return path

    def prepare(self, output_id: str, cancelled: Event) -> dict:
        directory = self.directory(output_id)
        check_cancelled(cancelled, "prepare analysis output")
        with rasterio.open(directory / "result.tif") as src:
            if src.crs is None or src.count != 3 or set(src.dtypes) != {"uint8"}:
                raise AnalysisError(
                    "UNSUPPORTED_RASTER",
                    "This renderer requires a georeferenced three-band uint8 RGB raster.",
                )
            bounds = list(transform_bounds(src.crs, "EPSG:4326", *src.bounds))
            data = src.read(out_shape=(3, 512, 512), resampling=Resampling.nearest)
            mask = src.dataset_mask(out_shape=(512, 512), resampling=Resampling.nearest)
            rgba = np.dstack((np.moveaxis(data, 0, -1), mask))
            metadata = {
                "width": src.width,
                "height": src.height,
                "bands": src.count,
                "dtypes": list(src.dtypes),
                "crs": str(src.crs),
                "bounds": bounds,
                "nodata": src.nodata,
                "display_kind": "rgb",
                "numeric_ndvi_available": False,
            }
        check_cancelled(cancelled, "publish analysis preview")
        Image.fromarray(rgba).save(directory / "preview.png")
        return metadata

    def tile(self, relative: str, z: int, x: int, y: int) -> bytes:
        if z < 0 or z > 24 or x < 0 or y < 0 or x >= 2**z or y >= 2**z:
            raise AnalysisError("INVALID_TILE", "Invalid tile coordinates.", 422)
        return _render_tile(self.path(relative), z, x, y)


@lru_cache(maxsize=128)
def _render_tile(path: Path, z: int, x: int, y: int) -> bytes:
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
        data = vrt.read(indexes=(1, 2, 3, 4))
    out = BytesIO()
    Image.fromarray(np.moveaxis(data, 0, -1)).save(out, format="PNG")
    return out.getvalue()
