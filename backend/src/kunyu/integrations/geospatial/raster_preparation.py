"""Crop native pixels without changing spectral values or source metadata."""

import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.shutil import copy as copy_raster
from rasterio.warp import transform_geom
from rasterio.windows import Window, from_bounds
from shapely.geometry import shape

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.integrations.geospatial.study_area import validated_geometry


def crop_raster(source: Path, destination: Path, geometry: dict) -> dict:
    geometry = validated_geometry(geometry)
    if destination.exists():
        raise FileExistsError(destination)
    temporary = destination.with_suffix(".working.tif")
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with rasterio.open(source) as src:
            if src.crs is None:
                raise AnalysisError("MISSING_CRS", "源影像缺少坐标系。", 422)
            polygon = transform_geom("EPSG:4326", src.crs, geometry)
            bounds = shape(polygon).bounds
            if not shape(polygon).within(
                shape(
                    {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [src.bounds.left, src.bounds.bottom],
                                [src.bounds.right, src.bounds.bottom],
                                [src.bounds.right, src.bounds.top],
                                [src.bounds.left, src.bounds.top],
                                [src.bounds.left, src.bounds.bottom],
                            ]
                        ],
                    }
                )
            ):
                raise AnalysisError(
                    "AOI_OUTSIDE_RASTER", "研究区未被源影像完整覆盖。", 422
                )
            raw = from_bounds(*bounds, src.transform)
            left, top = math.floor(raw.col_off + 1e-6), math.floor(raw.row_off + 1e-6)
            right = math.ceil(raw.col_off + raw.width - 1e-6)
            bottom = math.ceil(raw.row_off + raw.height - 1e-6)
            window = Window(left, top, right - left, bottom - top)
            if window.width * window.height * src.count > 100_000_000:
                raise AnalysisError(
                    "AOI_TOO_LARGE", "裁剪区域超过一亿个波段像元。", 422
                )
            values = src.read(window=window)
            transform = src.window_transform(window)
            mask = geometry_mask(
                [polygon], out_shape=values.shape[1:], transform=transform, invert=True
            )
            valid = src.dataset_mask(window=window) > 0
            profile = src.profile.copy()
            profile.update(
                driver="GTiff",
                width=values.shape[2],
                height=values.shape[1],
                transform=transform,
                tiled=True,
                blockxsize=256,
                blockysize=256,
                compress="deflate",
            )
            with rasterio.open(temporary, "w", **profile) as dst:
                dst.write(values)
                dst.write_mask((mask & valid).astype("uint8") * 255)
                dst.update_tags(
                    **src.tags(), PREPARATION="Native-grid AOI crop; source DN retained"
                )
                dst.scales, dst.offsets = src.scales, src.offsets
                for band in src.indexes:
                    if src.descriptions[band - 1] is not None:
                        dst.set_band_description(band, src.descriptions[band - 1])
                    dst.update_tags(band, **src.tags(band))
            overview = (
                "NEAREST" if src.count == 1 and src.dtypes[0] == "uint8" else "AVERAGE"
            )
            copy_raster(
                temporary,
                destination,
                driver="COG",
                COMPRESS="DEFLATE",
                BLOCKSIZE=256,
                OVERVIEW_RESAMPLING=overview,
            )
        with rasterio.open(destination) as dst:
            if not np.array_equal(values, dst.read()):
                raise AnalysisError("CROP_VALUES_CHANGED", "裁剪像元校验失败。")
            if not np.array_equal(mask & valid, dst.dataset_mask() > 0):
                raise AnalysisError("CROP_MASK_CHANGED", "裁剪有效掩膜校验失败。")
            return {
                "file": destination.name,
                "width": dst.width,
                "height": dst.height,
                "bands": dst.descriptions,
                "crs": str(dst.crs),
                "transform": list(dst.transform),
                "size_bytes": destination.stat().st_size,
            }
    finally:
        temporary.unlink(missing_ok=True)
        temporary.with_suffix(".tif.msk").unlink(missing_ok=True)
