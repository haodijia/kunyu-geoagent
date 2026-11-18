"""Measure named geometries against the class groups declared by a result."""

import json
from dataclasses import dataclass
from pathlib import Path
from threading import Event
from typing import Literal

import numpy as np
import rasterio
import shapely
from pyproj import Transformer
from rasterio.features import geometry_mask
from rasterio.transform import rowcol
from rasterio.windows import Window, from_bounds, transform
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry
from shapely.ops import substring

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.object_review import ObjectReviewItem, ObjectReviewProfile
from kunyu.integrations.filesystem.io import check_cancelled

MAX_RASTER_CELLS = 8_000_000
MAX_LINE_SAMPLES = 100_000


@dataclass(frozen=True)
class ReviewObject:
    name: str
    kind: Literal["area", "line"]
    geometry: BaseGeometry


@dataclass(frozen=True)
class ReviewGrid:
    affine: rasterio.Affine
    classification: np.ndarray
    evidence: np.ndarray | None
    profile: ObjectReviewProfile
    codes: tuple[int, ...]

    def measure(self, values, evidence, weights):
        known = np.isin(values, self.codes)
        candidate = np.isin(values, self.profile.candidate_values)
        missing = np.isin(values, self.profile.missing_values)
        ambiguous = np.isin(values, self.profile.ambiguous_values)
        totals = [
            weights[mask].sum() for mask in (known, candidate, missing, ambiguous)
        ]
        support = None
        if evidence is not None:
            support = weights[
                candidate & np.isin(evidence, self.profile.evidence.values)
            ].sum()
        return (*totals, support), candidate | missing | ambiguous


def measure_objects(
    path: Path,
    profile: ObjectReviewProfile,
    class_band: int,
    evidence_band: int | None,
    codes: tuple[int, ...],
    objects: list[ReviewObject],
    cancelled: Event,
) -> list[ObjectReviewItem]:
    with rasterio.open(path) as src:
        if src.width * src.height > MAX_RASTER_CELLS:
            raise AnalysisError(
                "REVIEW_RASTER_TOO_LARGE", "成果范围超过核查上限。", 422
            )
        if (
            src.crs is None
            or not src.crs.is_projected
            or src.crs.linear_units_factor[1] != 1
            or not (src.transform.a > 0 > src.transform.e)
            or src.transform.b != 0
            or src.transform.d != 0
        ):
            raise AnalysisError(
                "REVIEW_GRID_UNSUPPORTED", "对象核查需要以米为单位的正北投影格网。", 422
            )
        classification = src.read(class_band, masked=True, out_dtype="float64").filled(
            np.nan
        )
        evidence = (
            src.read(evidence_band, masked=True, out_dtype="float64").filled(np.nan)
            if evidence_band is not None
            else None
        )
        grid = ReviewGrid(src.transform, classification, evidence, profile, codes)
        raster_bounds = box(*src.bounds)
        project = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
        unproject = Transformer.from_crs(src.crs, "EPSG:4326", always_xy=True)
        result = []
        for obj in objects:
            check_cancelled(cancelled, "measure review object")
            projected = shapely.transform(
                obj.geometry, project.transform, interleaved=False
            )
            clipped = projected.intersection(raster_bounds)
            if clipped.is_empty:
                continue
            if obj.kind == "area":
                if clipped.area == 0:
                    continue
                extent = projected.area
                focus = shapely.union_all(
                    [part for part in shapely.get_parts(clipped) if part.area > 0]
                )
                totals = _area(grid, focus)
            else:
                extent = projected.length
                totals, focus = _line(grid, clipped, cancelled)
            covered, candidate, missing, ambiguous, support = totals
            if covered == 0:
                continue
            geometry = shapely.transform(focus, unproject.transform, interleaved=False)
            result.append(
                ObjectReviewItem(
                    name=obj.name,
                    kind=obj.kind,
                    geometry=json.loads(shapely.to_geojson(geometry)),
                    bounds=_focus_bounds(geometry),
                    extent=extent,
                    covered=covered,
                    candidate=candidate,
                    evidence=support,
                    missing=missing,
                    ambiguous=ambiguous,
                )
            )
        return result


def _focus_bounds(geometry):
    west, south, east, north = geometry.bounds
    if west == east:
        west, east = max(-180, west - 0.00005), min(180, east + 0.00005)
    if south == north:
        south, north = max(-90, south - 0.00005), min(90, north + 0.00005)
    return west, south, east, north


def _area(grid, geometry):
    raw = from_bounds(*geometry.bounds, grid.affine)
    height, width = grid.classification.shape
    left, top = max(0, int(np.floor(raw.col_off))), max(0, int(np.floor(raw.row_off)))
    right = min(width, int(np.ceil(raw.col_off + raw.width)))
    bottom = min(height, int(np.ceil(raw.row_off + raw.height)))
    window = Window(left, top, right - left, bottom - top)
    selected = geometry_mask(
        [geometry],
        out_shape=(bottom - top, right - left),
        transform=transform(window, grid.affine),
        invert=True,
    )
    cells = np.s_[top:bottom, left:right]
    values = grid.classification[cells][selected]
    evidence = grid.evidence[cells][selected] if grid.evidence is not None else None
    weights = np.broadcast_to(abs(grid.affine.a * grid.affine.e), values.shape)
    totals, _ = grid.measure(values, evidence, weights)
    return totals


def _line(grid, geometry, cancelled):
    totals = np.zeros(4)
    support = 0.0 if grid.evidence is not None else None
    highlights = []
    parts = [
        part for part in shapely.get_parts(geometry) if part.geom_type == "LineString"
    ]
    step = min(grid.affine.a, -grid.affine.e) / 2
    if geometry.length / step + len(parts) > MAX_LINE_SAMPLES:
        raise AnalysisError("REVIEW_LINE_TOO_LARGE", "线状对象范围超过核查上限。", 422)
    height, width = grid.classification.shape
    for part in parts:
        check_cancelled(cancelled, "measure review line")
        length = part.length
        edges = np.linspace(0, length, int(np.ceil(length / step)) + 1)
        widths = np.diff(edges)
        points = shapely.line_interpolate_point(part, edges[:-1] + widths / 2)
        rows, cols = rowcol(grid.affine, shapely.get_x(points), shapely.get_y(points))
        rows, cols = np.asarray(rows), np.asarray(cols)
        inside = (rows >= 0) & (cols >= 0) & (rows < height) & (cols < width)
        rows, cols = rows[inside], cols[inside]
        evidence = grid.evidence[rows, cols] if grid.evidence is not None else None
        measures, relevant = grid.measure(
            grid.classification[rows, cols], evidence, widths[inside]
        )
        totals += measures[:4]
        if support is not None:
            support += measures[4]
        selected = np.zeros(len(widths), dtype=bool)
        selected[inside] = relevant
        edges_of_runs = np.flatnonzero(np.diff(np.r_[False, selected, False]))
        highlights.extend(
            substring(part, edges[start], edges[end])
            for start, end in edges_of_runs.reshape(-1, 2)
        )
    return (*totals, support), shapely.union_all(highlights or parts)
