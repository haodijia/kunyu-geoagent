"""Measure park footprints and road centerlines against persisted water classes."""

import json
from dataclasses import dataclass
from pathlib import Path
from threading import Event
from typing import Literal

import numpy as np
import rasterio
import shapely
from pyproj import Transformer
from rasterio.transform import rowcol
from shapely.geometry import box, mapping
from shapely.geometry.base import BaseGeometry
from shapely.ops import substring

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.water_review import WaterReviewItem
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.geospatial.raster_inspection import region_statistics

MAX_RASTER_CELLS = 8_000_000
MAX_FEATURE_COORDINATES = 10_000
MAX_ROAD_SAMPLES = 100_000
_WATER_CLASSES = [{"value": value} for value in range(6)]


@dataclass(frozen=True)
class ReviewObject:
    name: str
    kind: Literal["park", "road"]
    source: str
    attribution: str | None
    geometry: BaseGeometry


def measure_objects(
    path: Path,
    change_band: int,
    stability_band: int,
    objects: list[ReviewObject],
    cancelled: Event,
) -> list[WaterReviewItem]:
    with rasterio.open(path) as src:
        if src.width * src.height > MAX_RASTER_CELLS:
            raise AnalysisError(
                "REVIEW_RASTER_TOO_LARGE", "成果范围超过核查上限。", 422
            )
        if (
            src.crs is None
            or not src.crs.is_projected
            or src.crs.linear_units_factor[1] != 1
        ):
            raise AnalysisError(
                "REVIEW_GRID_UNSUPPORTED", "对象核查需要以米为单位的投影格网。", 422
            )
        classification, stable = src.read(
            [change_band, stability_band], masked=True, out_dtype="float32"
        ).filled(np.nan)
        project = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
        unproject = Transformer.from_crs(src.crs, "EPSG:4326", always_xy=True)
        grid = box(*src.bounds)
        result = []
        for obj in objects:
            check_cancelled(cancelled, "water object review")
            if obj.kind == "park":
                geometry = obj.geometry
                extent, covered, candidate, consistent, missing, disagreement = _park(
                    path, geometry, change_band, stability_band
                )
            else:
                line = shapely.transform(
                    obj.geometry, project.transform, interleaved=False
                )
                pieces = line.intersection(grid)
                if pieces.is_empty:
                    continue
                extent, covered, candidate, consistent, missing, disagreement, focus = (
                    _road(pieces, classification, stable, src.transform, cancelled)
                )
                geometry = shapely.transform(
                    focus, unproject.transform, interleaved=False
                )
            if covered == 0:
                continue
            west, south, east, north = geometry.bounds
            if west == east:
                west, east = max(-180, west - 0.00005), min(180, east + 0.00005)
            if south == north:
                south, north = max(-90, south - 0.00005), min(90, north + 0.00005)
            result.append(
                WaterReviewItem(
                    name=obj.name,
                    kind=obj.kind,
                    source=obj.source,
                    attribution=obj.attribution,
                    geometry=json.loads(shapely.to_geojson(geometry)),
                    bounds=(west, south, east, north),
                    extent=extent,
                    covered=covered,
                    candidate=candidate,
                    stable=consistent,
                    missing=missing,
                    disagreement=disagreement,
                )
            )
        return result


def _park(path, geometry, change_band, stability_band):
    shape = mapping(geometry)
    try:
        stats = region_statistics(path, shape, change_band, _WATER_CLASSES)
        coverage = [item["area_m2"] for item in stats["classes"]]
        consistent = region_statistics(path, shape, stability_band, None, [1])
    except AnalysisError as error:
        if error.code == "NO_RASTER_OVERLAP":
            return (0.0,) * 6
        raise
    return (
        stats["region_area_m2"],
        sum(coverage),
        coverage[2],
        consistent["value_areas"][0]["area_m2"],
        coverage[5],
        coverage[4],
    )


def _road(line, classification, stable, affine, cancelled):
    extent = covered = candidate = consistent = missing = disagreement = 0.0
    highlights = []
    parts = [
        part
        for part in shapely.get_parts(line)
        if part.geom_type == "LineString" and part.length > 0
    ]
    step = min(np.hypot(affine.a, affine.d), np.hypot(affine.b, affine.e)) / 2
    if line.length / step + len(parts) > MAX_ROAD_SAMPLES:
        raise AnalysisError("REVIEW_ROAD_TOO_LARGE", "道路范围超过核查上限。", 422)
    for part in parts:
        check_cancelled(cancelled, "road centerline review")
        length = part.length
        extent += length
        edges = np.linspace(0, length, int(np.ceil(length / step)) + 1)
        widths = np.diff(edges)
        points = shapely.line_interpolate_point(part, edges[:-1] + widths / 2)
        rows, cols = rowcol(affine, shapely.get_x(points), shapely.get_y(points))
        rows, cols = np.asarray(rows), np.asarray(cols)
        height, width = classification.shape
        inside = (rows >= 0) & (cols >= 0) & (rows < height) & (cols < width)
        rows, cols = rows[inside], cols[inside]
        values = classification[rows, cols]
        weights = widths[inside]
        positives = values == 2
        known = np.isfinite(values)
        covered += weights[known].sum()
        candidate += weights[positives].sum()
        consistent += weights[positives & (stable[rows, cols] == 1)].sum()
        missing += weights[values == 5].sum()
        disagreement += weights[values == 4].sum()
        selected = np.zeros(len(widths), dtype=bool)
        selected[inside] = positives | (values == 4) | (values == 5)
        edges_of_runs = np.flatnonzero(np.diff(np.r_[False, selected, False]))
        highlights.extend(
            substring(part, edges[start], edges[end])
            for start, end in edges_of_runs.reshape(-1, 2)
        )
    focus = shapely.union_all(highlights or parts)
    return extent, covered, candidate, consistent, missing, disagreement, focus
