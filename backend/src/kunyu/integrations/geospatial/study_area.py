"""Validate WGS84 research polygons and measure ellipsoidal area."""

import json
import math

from pyproj import Geod
from shapely import get_coordinates, to_geojson
from shapely.geometry import shape
from shapely.geometry.polygon import orient

from kunyu.domain.geospatial.analysis import AnalysisError


def validated_geometry(geometry: dict) -> dict:
    if geometry.get("type") not in {"Polygon", "MultiPolygon"}:
        raise AnalysisError(
            "INVALID_AOI", "研究区必须为 Polygon 或 MultiPolygon。", 422
        )
    try:
        polygon = shape(geometry)
    except (TypeError, ValueError, KeyError) as error:
        raise AnalysisError("INVALID_AOI", "研究区几何格式无效。", 422) from error
    if polygon.is_empty or not polygon.is_valid or polygon.has_z:
        raise AnalysisError("INVALID_AOI", "研究区须为无自交的二维多边形。", 422)
    coordinates = get_coordinates(polygon)
    if len(coordinates) > 10000 or any(
        not math.isfinite(x)
        or not math.isfinite(y)
        or not -180 <= x <= 180
        or not -85 <= y <= 85
        for x, y in coordinates
    ):
        raise AnalysisError("INVALID_AOI", "研究区坐标超出范围或顶点过多。", 422)
    if polygon.bounds[2] - polygon.bounds[0] > 180:
        raise AnalysisError("INVALID_AOI", "当前研究区不支持跨越日期变更线。", 422)
    return json.loads(to_geojson(polygon))


def area_m2(geometry: dict) -> float:
    polygon = shape(geometry)
    parts = [polygon] if polygon.geom_type == "Polygon" else polygon.geoms
    geod = Geod(ellps="WGS84")
    return sum(
        abs(geod.geometry_area_perimeter(orient(part, sign=1))[0]) for part in parts
    )
