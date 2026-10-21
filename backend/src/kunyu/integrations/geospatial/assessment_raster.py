"""Classify aligned index outputs and retain observed, invalid and filtered areas."""

import csv
import json
from pathlib import Path
from threading import Event

import numpy as np
import rasterio
from rasterio.features import geometry_mask, shapes
from rasterio.warp import transform_geom
from shapely.geometry import box, shape

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.assessment import Assessment
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.geospatial.study_area import area_m2

CATEGORIES = [
    {"value": 0, "label": "稳定非水体", "color": "#e2e8f0"},
    {"value": 1, "label": "持续水体", "color": "#2563eb"},
    {"value": 2, "label": "新增水体候选", "color": "#ef4444"},
    {"value": 3, "label": "退水区域", "color": "#f59e0b"},
    {"value": 4, "label": "无效观测", "color": "#64748b"},
]


def build_change(
    assessment: Assessment, paths: list[Path], directory: Path, cancelled: Event
) -> dict:
    arrays = []
    profile = None
    for index, path in enumerate(paths):
        check_cancelled(cancelled, "read assessment inputs")
        with rasterio.open(path) as src:
            if src.count != 1 or src.crs is None or src.width * src.height > 4_000_000:
                raise AnalysisError(
                    "INVALID_ASSESSMENT_RASTER",
                    "输入须为不超过四百万像元的单波段地理栅格。",
                    422,
                )
            current = (src.crs, src.transform, src.width, src.height)
            if index == 0:
                grid = current
                profile = src.profile.copy()
            elif current != grid:
                raise AnalysisError(
                    "ASSESSMENT_GRID_MISMATCH",
                    "四份输入须具有完全一致的坐标系、范围、分辨率和网格原点。",
                    422,
                )
            arrays.append(src.read(1, masked=True))
    crs, transform, width, height = grid
    polygon = transform_geom("EPSG:4326", crs, assessment.area.geometry)
    extent = box(*rasterio.transform.array_bounds(height, width, transform))
    if not extent.buffer(max(abs(transform.a), abs(transform.e)) * 0.001).covers(
        shape(polygon)
    ):
        raise AnalysisError("AOI_OUTSIDE_RASTER", "研究区未被全部输入栅格覆盖。", 422)
    aoi = geometry_mask(
        [polygon], out_shape=(height, width), transform=transform, invert=True
    )
    if not aoi.any():
        raise AnalysisError("EMPTY_AOI", "研究区内没有像元中心。", 422)
    before, after, before_scl, after_scl = arrays
    for quality in (before_scl, after_scl):
        values = quality.compressed()
        if not np.isin(values, np.arange(12)).all():
            raise AnalysisError("INVALID_SCL", "质量层包含非 SCL 类别值。", 422)
    before_valid = (
        ~np.ma.getmaskarray(before)
        & np.isfinite(before.astype("float64").filled(np.nan))
        & ~np.ma.getmaskarray(before_scl)
        & np.isin(before_scl.data, [4, 5, 6])
    )
    after_valid = (
        ~np.ma.getmaskarray(after)
        & np.isfinite(after.astype("float64").filled(np.nan))
        & ~np.ma.getmaskarray(after_scl)
        & np.isin(after_scl.data, [4, 5, 6])
    )
    common = aoi & before_valid & after_valid
    if not common.any():
        raise AnalysisError(
            "NO_COMMON_OBSERVATION", "研究区没有两期共同清晰有效观测。", 422
        )
    previous = before.data > assessment.request.threshold
    later = after.data > assessment.request.threshold
    classification = np.full((height, width), 255, dtype="uint8")
    classification[aoi] = 4
    classification[common] = previous[common].astype("uint8") + 2 * later[
        common
    ].astype("uint8")
    # Binary pairs: 00 stable land, 01 retreat, 10 added, 11 persistent water.
    classification[common & previous & ~later] = 3
    classification[common & previous & later] = 1
    profile.update(
        driver="GTiff",
        count=1,
        dtype="uint8",
        nodata=255,
        tiled=True,
        blockxsize=256,
        blockysize=256,
        compress="deflate",
    )
    with rasterio.open(directory / "result.tif", "w", **profile) as dst:
        dst.write(classification, 1)
        dst.set_band_description(1, "water_change")
        dst.update_tags(
            KUNYU_CATEGORIES=json.dumps(CATEGORIES, ensure_ascii=False),
            ASSESSMENT_ID=assessment.id,
            METHOD="MNDWI threshold on common SCL 4/5/6 observations",
        )
    features = []
    totals = {str(i): 0.0 for i in range(5)}
    retained = 0.0
    for count, (geometry, code) in enumerate(
        shapes(classification, mask=aoi, transform=transform, connectivity=4)
    ):
        if count >= 50_000:
            raise AnalysisError(
                "TOO_MANY_PATCHES",
                "分类碎片超过五万个，请缩小研究区并核查输入质量。",
                422,
            )
        check_cancelled(cancelled, "measure change polygons")
        wgs84 = transform_geom(crs, "EPSG:4326", geometry)
        measured = area_m2(wgs84)
        value = int(code)
        totals[str(value)] += measured
        if value != 2 or measured < assessment.request.min_patch_area_m2:
            continue
        if len(features) >= 10_000:
            raise AnalysisError(
                "TOO_MANY_CANDIDATES",
                "保留候选超过一万个，请调整最小图斑面积或缩小研究区。",
                422,
            )
        retained += measured
        features.append(
            {
                "type": "Feature",
                "id": len(features) + 1,
                "geometry": wgs84,
                "properties": {
                    "class": 2,
                    "area_m2": measured,
                    "assessment_id": assessment.id,
                    "before_date": str(assessment.request.before_date),
                    "after_date": str(assessment.request.after_date),
                },
            }
        )
    collection = {"type": "FeatureCollection", "features": features}
    (directory / "added-water.geojson").write_text(
        json.dumps(collection, ensure_ascii=False), encoding="utf-8"
    )
    observed = sum(totals[str(i)] for i in range(4))
    raster_area = sum(totals.values())
    metrics = {
        "aoi_area_m2": assessment.area.area_m2,
        "rasterized_aoi_area_m2": raster_area,
        "common_valid_area_m2": observed,
        "common_valid_fraction": observed / raster_area,
        "invalid_area_m2": totals["4"],
        "before_water_area_m2": totals["1"] + totals["3"],
        "after_water_area_m2": totals["1"] + totals["2"],
        "persistent_water_area_m2": totals["1"],
        "raw_added_water_area_m2": totals["2"],
        "retained_added_water_area_m2": retained,
        "filtered_small_patch_area_m2": totals["2"] - retained,
        "retreat_area_m2": totals["3"],
        "added_fraction_of_common_valid": totals["2"] / observed,
        "retained_patch_count": len(features),
        "before_clear_pixel_fraction": float((aoi & before_valid).sum() / aoi.sum()),
        "after_clear_pixel_fraction": float((aoi & after_valid).sum() / aoi.sum()),
        "grid_crs": str(crs),
        "resolution": [abs(transform.a), abs(transform.e)],
        "class_areas_m2": totals,
        "area_method": "WGS84 ellipsoidal polygon area; pixel-centre AOI; 4-connected polygons",
        "quality_rule": "SCL in [4,5,6] in both dates; masked/non-finite index values excluded",
    }
    (directory / "metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    with (directory / "metrics.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as stream:
        writer = csv.writer(stream)
        writer.writerow(["metric", "value", "unit"])
        for name, value in metrics.items():
            if isinstance(value, (int, float)):
                writer.writerow(
                    [
                        name,
                        value,
                        "m2"
                        if name.endswith("_m2")
                        else "fraction"
                        if "fraction" in name
                        else "count",
                    ]
                )
    return metrics
