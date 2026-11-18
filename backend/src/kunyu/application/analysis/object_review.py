"""Review a result using vector partitions that intersect its footprint."""

import json
from threading import Event

import shapely
from shapely.errors import GEOSException
from shapely.geometry import box, shape
from shapely.geometry.base import BaseGeometry

from kunyu.application.analysis.analysis import AnalysisService
from kunyu.domain.geospatial.analysis import AnalysisError, AnalysisOutput
from kunyu.domain.geospatial.object_review import (
    ObjectReview,
    ObjectReviewProfile,
    ObjectVectors,
    ReviewVector,
    ReviewVectorProperties,
)
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.geospatial.object_review import measure_object
from kunyu.integrations.geospatial.review_catalog import (
    matched_partitions,
    vector_features,
)
from kunyu.integrations.oge.service_catalog import registered_object_review

MAX_FEATURE_COORDINATES = 10_000
_KIND_BY_GEOMETRY = {
    "Point": "point",
    "MultiPoint": "point",
    "Polygon": "area",
    "MultiPolygon": "area",
    "LineString": "line",
    "MultiLineString": "line",
}


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

    def vectors(
        self, workspace: str, output_id: str, cancelled: Event
    ) -> ObjectVectors:
        output, _ = self._result(workspace, output_id)
        extent = box(*output.bounds)
        partitions = matched_partitions(extent)
        if not partitions:
            return ObjectVectors(datasets=[], coverage="none", features=[])

        vectors = []
        for dataset, footprint in partitions:
            for index, feature in enumerate(vector_features(dataset)):
                check_cancelled(cancelled, "read object vectors")
                parsed = _vector(feature, footprint, dataset.name)
                if parsed is None:
                    continue
                geometry, properties = parsed
                name = properties.get("name:zh") or properties.get("name")
                vectors.append(
                    ReviewVector(
                        id=f"{dataset.id}:{index}",
                        geometry=json.loads(shapely.to_geojson(geometry)),
                        properties=ReviewVectorProperties(
                            name=name.strip()
                            if isinstance(name, str) and name.strip()
                            else None,
                            kind=_KIND_BY_GEOMETRY[geometry.geom_type],
                            dataset_id=dataset.id,
                            feature_index=index,
                        ),
                    )
                )

        footprints = [footprint for _, footprint in partitions]
        coverage = "full" if shapely.union_all(footprints).covers(extent) else "partial"
        return ObjectVectors(
            datasets=[dataset for dataset, _ in partitions],
            coverage=coverage,
            features=vectors,
        )

    def inspect(
        self,
        workspace: str,
        output_id: str,
        dataset_id: str,
        feature_index: int,
        cancelled: Event,
    ) -> ObjectReview:
        output, (profile, class_band, evidence_band, codes) = self._result(
            workspace, output_id
        )
        for dataset, footprint in matched_partitions(box(*output.bounds)):
            if dataset.id != dataset_id:
                continue
            features = vector_features(dataset)
            if 0 <= feature_index < len(features):
                parsed = _vector(features[feature_index], footprint, dataset.name)
                if parsed is not None:
                    geometry, properties = parsed
                    break
        else:
            raise AnalysisError(
                "REVIEW_OBJECT_NOT_FOUND", "该对象不在当前成果的矢量图层中。", 404
            )

        kind = _KIND_BY_GEOMETRY[geometry.geom_type]
        if (
            kind == "line"
            and profile.exclude_elevated_lines
            and (
                any(properties.get(key, "no") != "no" for key in ("bridge", "tunnel"))
                or str(properties.get("layer", "0")) != "0"
            )
        ):
            return ObjectReview(status="excluded")

        cog, _ = self.analysis.repository.files(workspace, output_id)
        measurement = measure_object(
            self.analysis.raster.path(cog),
            profile,
            class_band,
            evidence_band,
            codes,
            geometry,
            kind,
            cancelled,
        )
        if measurement is None:
            return ObjectReview(status="outside")
        return ObjectReview(status="measured", measurement=measurement)

    def _result(self, workspace: str, output_id: str):
        output = self.analysis.repository.workspace_output(workspace, output_id)
        resolved = _resolved_review(output)
        if resolved is None:
            raise AnalysisError(
                "REVIEW_RESULT_UNSUPPORTED", "该成果契约未声明对象核查。", 422
            )
        return output, resolved


def _vector(feature, footprint, source):
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        raise AnalysisError("INVALID_REVIEW_DATASET", f"{source} 存在无效要素。", 422)
    raw = feature.get("geometry")
    if raw is None:
        return None
    properties = feature.get("properties")
    if properties is not None and not isinstance(properties, dict):
        raise AnalysisError(
            "INVALID_REVIEW_DATASET", f"{source} 存在无效要素属性。", 422
        )
    if (
        not isinstance(raw, dict)
        or (kind := _KIND_BY_GEOMETRY.get(raw.get("type"))) is None
    ):
        raise AnalysisError(
            "INVALID_REVIEW_GEOMETRY", f"{source} 含有不受支持的几何。", 422
        )
    clipped = footprint.intersection(_geometry(raw, source))
    parts = [
        part
        for part in shapely.get_parts(clipped)
        if not part.is_empty and _KIND_BY_GEOMETRY.get(part.geom_type) == kind
    ]
    if parts:
        return shapely.union_all(parts), properties or {}
    return None


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
