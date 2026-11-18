"""Review a result using vector partitions that intersect its footprint."""

from collections import defaultdict
from threading import Event
from typing import Literal

import shapely
from shapely.errors import GEOSException
from shapely.geometry import box, shape
from shapely.geometry.base import BaseGeometry

from kunyu.application.analysis.analysis import AnalysisService
from kunyu.domain.geospatial.analysis import AnalysisError, AnalysisOutput
from kunyu.domain.geospatial.object_review import (
    ObjectReview,
    ObjectReviewProfile,
)
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.geospatial.object_review import ReviewObject, measure_objects
from kunyu.integrations.geospatial.review_catalog import (
    matched_partitions,
    vector_features,
)
from kunyu.integrations.oge.service_catalog import registered_object_review

MAX_FEATURE_COORDINATES = 10_000
_KIND_BY_GEOMETRY = {
    "Polygon": "area",
    "MultiPolygon": "area",
    "LineString": "line",
    "MultiLineString": "line",
}
Kind = Literal["area", "line"]


def review_profile(output: AnalysisOutput) -> ObjectReviewProfile | None:
    resolved = _resolved_review(output)
    return resolved[0] if resolved is not None else None


def _resolved_review(
    output: AnalysisOutput,
) -> tuple[ObjectReviewProfile, int, int | None, tuple[int, ...]] | None:
    parameters = output.source_metadata.get("parameters")
    if not isinstance(parameters, dict):
        return None
    name, version = parameters.get("service_name"), parameters.get("service_version")
    if not isinstance(name, str) or not isinstance(version, str):
        return None
    declared = registered_object_review(name, version)
    if declared is None:
        return None
    profile, class_name, evidence_name, codes = declared
    bands = {band["name"]: band["index"] for band in output.metadata["bands"]}
    if class_name not in bands or (
        evidence_name is not None and evidence_name not in bands
    ):
        return None
    return profile, bands[class_name], bands.get(evidence_name), codes


class ObjectReviewService:
    def __init__(self, analysis: AnalysisService) -> None:
        self.analysis = analysis

    def inspect(
        self,
        workspace: str,
        output_id: str,
        query: str,
        cancelled: Event,
    ) -> ObjectReview:
        output = self.analysis.repository.workspace_output(workspace, output_id)
        resolved = _resolved_review(output)
        if resolved is None:
            raise AnalysisError(
                "REVIEW_RESULT_UNSUPPORTED", "该成果契约未声明对象核查。", 422
            )
        profile, class_band, evidence_band, codes = resolved
        extent = box(*output.bounds)
        partitions = matched_partitions(extent)
        if not partitions:
            raise AnalysisError(
                "REVIEW_NO_VECTOR_COVERAGE", "矢量数据目录暂未覆盖该成果区域。", 422
            )
        footprints = [coverage for _, coverage in partitions]
        coverage = "full" if shapely.union_all(footprints).covers(extent) else "partial"
        groups: dict[tuple[Kind, str], list[BaseGeometry]] = defaultdict(list)
        for dataset, footprint in partitions:
            check_cancelled(cancelled, "read review dataset")
            for key, geometry in _dataset_objects(
                vector_features(dataset),
                footprint,
                profile,
                dataset.name,
                query,
                cancelled,
            ):
                groups[key].append(geometry)
        objects = [
            ReviewObject(name, kind, shapely.union_all(geometries))
            for (kind, name), geometries in groups.items()
        ]
        items = []
        if objects:
            cog, _ = self.analysis.repository.files(workspace, output_id)
            items = measure_objects(
                self.analysis.raster.path(cog),
                profile,
                class_band,
                evidence_band,
                codes,
                objects,
                cancelled,
            )
        ranked = []
        for kind in ("area", "line"):
            ranked.extend(
                sorted(
                    (
                        item
                        for item in items
                        if item.kind == kind
                        and (query or item.candidate or item.missing or item.ambiguous)
                    ),
                    key=lambda item: (
                        -(item.evidence or 0),
                        -item.candidate,
                        -item.missing,
                        -item.ambiguous,
                        item.name,
                    ),
                )[:5]
            )
        return ObjectReview(
            output_id=output_id,
            output_title=output.title,
            datasets=[dataset for dataset, _ in partitions],
            coverage=coverage,
            profile=profile,
            items=ranked,
        )


def _dataset_objects(features, extent, profile, source, query, cancelled):
    term = query.casefold()
    for feature in features:
        check_cancelled(cancelled, "read object review features")
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise AnalysisError(
                "INVALID_REVIEW_DATASET", f"{source} 存在无效要素。", 422
            )
        properties, raw = feature.get("properties"), feature.get("geometry")
        if not isinstance(properties, dict) or not isinstance(raw, dict):
            continue
        name = properties.get("name:zh") or properties.get("name")
        kind = _KIND_BY_GEOMETRY.get(raw.get("type"))
        if (
            not isinstance(name, str)
            or not name.strip()
            or len(name) > 160
            or kind is None
        ):
            continue
        if term and term not in name.casefold():
            continue
        if (
            kind == "line"
            and profile.exclude_elevated_lines
            and (
                any(properties.get(key, "no") != "no" for key in ("bridge", "tunnel"))
                or str(properties.get("layer", "0")) != "0"
            )
        ):
            continue
        geometry = _geometry(raw, source)
        clipped = extent.intersection(geometry)
        parts = [
            part
            for part in shapely.get_parts(clipped)
            if not part.is_empty and _KIND_BY_GEOMETRY.get(part.geom_type) == kind
        ]
        if parts:
            yield (kind, name.strip()), shapely.union_all(parts)


def _geometry(raw: dict, source: str) -> BaseGeometry:
    try:
        geometry = shape(raw)
        if not geometry.is_empty and geometry.is_valid and not geometry.has_z:
            min_x, min_y, max_x, max_y = geometry.bounds
            if (
                -180 <= min_x <= max_x <= 180
                and -85 <= min_y <= max_y <= 85
                and max_x - min_x < 180
                and shapely.get_num_coordinates(geometry) <= MAX_FEATURE_COORDINATES
            ):
                return geometry
    except (GEOSException, KeyError, TypeError, ValueError) as error:
        raise AnalysisError(
            "INVALID_REVIEW_GEOMETRY", f"{source} 包含无效对象几何。", 422
        ) from error
    raise AnalysisError(
        "INVALID_REVIEW_GEOMETRY", f"{source} 的对象超出坐标或顶点限制。", 422
    )
