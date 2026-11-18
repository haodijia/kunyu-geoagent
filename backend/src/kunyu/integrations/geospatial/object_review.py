"""Read just the raster window needed to measure one selected vector."""

from dataclasses import dataclass
from pathlib import Path
from threading import Event

import numpy as np
import rasterio
import shapely
from pyproj import Transformer
from rasterio.features import geometry_mask
from rasterio.transform import rowcol
from rasterio.windows import Window, from_bounds
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.object_review import (
    ObjectKind,
    ObjectMeasurement,
    ObjectReviewProfile,
)
from kunyu.integrations.filesystem.io import check_cancelled

MAX_WINDOW_CELLS = 8_000_000
MAX_LINE_SAMPLES = 100_000


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
        support = (
            weights[candidate & np.isin(evidence, self.profile.evidence.values)].sum()
            if evidence is not None and self.profile.evidence is not None
            else 0.0
        )
        return np.array([*totals, support])

    def sample(self, points, weights):
        rows, cols = rowcol(self.affine, points[:, 0], points[:, 1])
        rows, cols = np.asarray(rows), np.asarray(cols)
        height, width = self.classification.shape
        inside = (rows >= 0) & (cols >= 0) & (rows < height) & (cols < width)
        rows, cols = rows[inside], cols[inside]
        evidence = self.evidence[rows, cols] if self.evidence is not None else None
        return self.measure(self.classification[rows, cols], evidence, weights[inside])


def measure_object(
    path: Path,
    profile: ObjectReviewProfile,
    class_band: int,
    evidence_band: int | None,
    codes: tuple[int, ...],
    geometry: BaseGeometry,
    kind: ObjectKind,
    cancelled: Event,
) -> ObjectMeasurement | None:
    with rasterio.open(path) as src:
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
        project = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
        projected = shapely.transform(geometry, project.transform, interleaved=False)
        clipped = projected.intersection(box(*src.bounds))
        if clipped.is_empty:
            return None
        raw = from_bounds(*clipped.bounds, src.transform)
        left, top = (
            max(0, int(np.floor(raw.col_off))),
            max(0, int(np.floor(raw.row_off))),
        )
        right = min(src.width, int(np.floor(raw.col_off + raw.width)) + 1)
        bottom = min(src.height, int(np.floor(raw.row_off + raw.height)) + 1)
        if right <= left or bottom <= top:
            return None
        if (right - left) * (bottom - top) > MAX_WINDOW_CELLS:
            raise AnalysisError(
                "REVIEW_RASTER_TOO_LARGE", "选中对象的核查范围过大。", 422
            )
        check_cancelled(cancelled, "read selected raster window")
        window = Window(left, top, right - left, bottom - top)
        classification = src.read(
            class_band, window=window, masked=True, out_dtype="float64"
        ).filled(np.nan)
        evidence = (
            src.read(
                evidence_band, window=window, masked=True, out_dtype="float64"
            ).filled(np.nan)
            if evidence_band is not None
            else None
        )
        grid = ReviewGrid(
            src.window_transform(window), classification, evidence, profile, codes
        )
        if kind == "area":
            extent = projected.area
            totals = _area(grid, clipped)
        elif kind == "line":
            extent = projected.length
            totals = _line(grid, clipped, cancelled)
        else:
            extent = shapely.get_num_coordinates(projected)
            points = shapely.get_coordinates(clipped)
            totals = grid.sample(points, np.ones(len(points)))
        covered, candidate, missing, ambiguous, support = totals
        if covered == 0:
            return None
        return ObjectMeasurement(
            extent=extent,
            covered=covered,
            candidate=candidate,
            evidence=support if evidence_band is not None else None,
            missing=missing,
            ambiguous=ambiguous,
        )


def _area(grid, geometry):
    polygons = [part for part in shapely.get_parts(geometry) if part.area > 0]
    if not polygons:
        return np.zeros(5)
    selected = geometry_mask(
        polygons,
        out_shape=grid.classification.shape,
        transform=grid.affine,
        invert=True,
    )
    values = grid.classification[selected]
    evidence = grid.evidence[selected] if grid.evidence is not None else None
    weights = np.broadcast_to(abs(grid.affine.a * grid.affine.e), values.shape)
    return grid.measure(values, evidence, weights)


def _line(grid, geometry, cancelled):
    parts = [
        part for part in shapely.get_parts(geometry) if part.geom_type == "LineString"
    ]
    step = min(grid.affine.a, -grid.affine.e) / 2
    if geometry.length / step + len(parts) > MAX_LINE_SAMPLES:
        raise AnalysisError("REVIEW_LINE_TOO_LARGE", "线状对象范围超过核查上限。", 422)
    totals = np.zeros(5)
    for part in parts:
        check_cancelled(cancelled, "measure review line")
        edges = np.linspace(0, part.length, int(np.ceil(part.length / step)) + 1)
        widths = np.diff(edges)
        points = shapely.line_interpolate_point(part, edges[:-1] + widths / 2)
        totals += grid.sample(shapely.get_coordinates(points), widths)
    return totals
