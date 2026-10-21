"""Read original raster cells and bounded regional statistics in geographic coordinates."""

import math
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.features import geometry_mask, shapes
from rasterio.warp import transform_geom
from rasterio.windows import Window, from_bounds
from shapely.geometry import shape

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.integrations.geospatial.study_area import area_m2, validated_geometry


def sample_raster(path: Path, longitude: float, latitude: float) -> dict:
    with rasterio.open(path) as src:
        x, y = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True).transform(
            longitude, latitude
        )
        if not math.isfinite(x) or not math.isfinite(y):
            return {"inside": False, "values": [], "bands": list(src.descriptions)}
        row, column = src.index(x, y)
        if not 0 <= row < src.height or not 0 <= column < src.width:
            return {"inside": False, "values": [], "bands": list(src.descriptions)}
        values = src.read(window=Window(column, row, 1, 1), masked=True).astype(
            "float64"
        )
        return {
            "inside": True,
            "row": row,
            "column": column,
            "values": [
                None if np.ma.is_masked(v) or not np.isfinite(v) else float(v)
                for v in values[:, 0, 0]
            ],
            "bands": list(src.descriptions),
            "crs": str(src.crs),
        }


def region_statistics(
    path: Path, geometry: dict, metadata: dict, values: list[float] | None = None
) -> dict:
    geometry = validated_geometry(geometry)
    with rasterio.open(path) as src:
        if src.count != 1:
            raise AnalysisError(
                "SCALAR_REQUIRED", "区域统计仅支持单波段数值或分类成果。", 422
            )
        projected = transform_geom("EPSG:4326", src.crs, geometry)
        bounds = shape(projected).bounds
        raw = from_bounds(*bounds, src.transform)
        left, top = (
            max(0, int(np.floor(raw.col_off))),
            max(0, int(np.floor(raw.row_off))),
        )
        right = min(src.width, int(np.ceil(raw.col_off + raw.width)))
        bottom = min(src.height, int(np.ceil(raw.row_off + raw.height)))
        if right <= left or bottom <= top:
            raise AnalysisError("NO_RASTER_OVERLAP", "统计区域与成果不相交。", 422)
        if (right - left) * (bottom - top) > 4_000_000:
            raise AnalysisError("REGION_TOO_LARGE", "统计区域超过四百万像元。", 422)
        window = Window(left, top, right - left, bottom - top)
        transform = src.window_transform(window)
        selected = geometry_mask(
            [projected],
            out_shape=(bottom - top, right - left),
            transform=transform,
            invert=True,
        )
        data = src.read(1, window=window, masked=True).astype("float64")
        valid = selected & ~np.ma.getmaskarray(data) & np.isfinite(data.data)
        observed = data.data[valid]
        result = {
            "region_area_m2": area_m2(geometry),
            "selected_pixel_count": int(selected.sum()),
            "valid_pixel_count": int(valid.sum()),
            "minimum": None,
            "maximum": None,
            "mean": None,
            "classes": [],
            "value_areas": [],
            "coverage_note": "统计范围限于成果覆盖区域，按像元中心纳入；分类无效观测单列。",
        }
        if len(observed):
            result.update(
                minimum=float(observed.min()),
                maximum=float(observed.max()),
                mean=float(observed.mean()),
            )
        categories = metadata.get("categories")
        if categories is not None:
            totals = {entry["value"]: 0.0 for entry in categories}
            for count, (polygon, code) in enumerate(
                shapes(data.data.astype("int32"), mask=valid, transform=transform)
            ):
                if count >= 50_000:
                    raise AnalysisError(
                        "TOO_MANY_PATCHES",
                        "统计区域的分类碎片超过五万个，请缩小范围。",
                        422,
                    )
                totals[int(code)] += area_m2(
                    transform_geom(src.crs, "EPSG:4326", polygon)
                )
            result["classes"] = [
                {**entry, "area_m2": totals[entry["value"]]} for entry in categories
            ]
            result.update(minimum=None, maximum=None, mean=None)
        fragments = 0
        for value in values or []:
            selected_value = valid & (data.data == value)
            measured = 0.0
            for polygon, _ in shapes(
                selected_value.astype("uint8"), mask=selected_value, transform=transform
            ):
                fragments += 1
                if fragments > 50_000:
                    raise AnalysisError(
                        "TOO_MANY_PATCHES",
                        "指定值的统计碎片超过五万个，请缩小范围。",
                        422,
                    )
                measured += area_m2(transform_geom(src.crs, "EPSG:4326", polygon))
            result["value_areas"].append(
                {
                    "value": value,
                    "pixel_count": int(selected_value.sum()),
                    "area_m2": measured,
                }
            )
        return result
