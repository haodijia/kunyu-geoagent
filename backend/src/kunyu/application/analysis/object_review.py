"""Use an explicitly chosen workspace dataset to review a compatible result."""

import json
import logging
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
    ReviewDataset,
)
from kunyu.domain.workspaces.filesystem import FilesystemError
from kunyu.integrations.filesystem.browse import WorkspaceBrowser
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.geospatial.object_review import ReviewObject, measure_objects
from kunyu.integrations.oge.service_catalog import registered_object_review

MAX_VECTOR_BYTES = 4 * 1024 * 1024
MAX_VECTOR_FEATURES = 20_000
MAX_FEATURE_COORDINATES = 10_000
_KIND_BY_GEOMETRY = {
    "Polygon": "area",
    "MultiPolygon": "area",
    "LineString": "line",
    "MultiLineString": "line",
}
Kind = Literal["area", "line"]
logger = logging.getLogger(__name__)


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
        self.files = WorkspaceBrowser(analysis.raster.root.parent)

    def datasets(
        self, workspace: str, output_id: str, cancelled: Event
    ) -> list[ReviewDataset]:
        self._output(workspace, output_id)
        return self._datasets(workspace, cancelled)

    def inspect(
        self,
        workspace: str,
        output_id: str,
        file_path: str,
        query: str,
        cancelled: Event,
    ) -> ObjectReview:
        output, profile, class_band, evidence_band, codes = self._output(
            workspace, output_id
        )
        dataset = next(
            (
                entry
                for entry in self._datasets(workspace, cancelled)
                if entry.file_path == file_path
            ),
            None,
        )
        if dataset is None:
            raise AnalysisError(
                "REVIEW_DATASET_NOT_FOUND", "请选用当前工作区文件中的 GeoJSON。", 404
            )
        try:
            with self.files.open(
                workspace, dataset.file_path, MAX_VECTOR_BYTES
            ) as content:
                data = json.loads(b"".join(content.chunks))
        except (UnicodeError, ValueError, RecursionError) as error:
            raise AnalysisError(
                "INVALID_REVIEW_DATASET", f"{dataset.name} 不是有效的 GeoJSON。", 422
            ) from error
        except FilesystemError as error:
            if error.code == "FS_PREVIEW_TOO_LARGE":
                raise AnalysisError(
                    "REVIEW_DATASET_TOO_LARGE", "GeoJSON 文件须小于 4 MiB。", 422
                ) from error
            logger.exception("Could not read review dataset %s", dataset.file_path)
            raise AnalysisError(
                "REVIEW_DATASET_UNAVAILABLE", "无法读取选中的 GeoJSON。", 503
            ) from error
        attribution, objects = _dataset_objects(
            data, box(*output.bounds), profile, dataset.name, query, cancelled
        )
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
            dataset=dataset,
            attribution=attribution,
            profile=profile,
            items=ranked,
        )

    def _datasets(self, workspace, cancelled):
        return [
            ReviewDataset(name=entry.name, file_path=entry.file_path)
            for entry in self.files.list(
                workspace, "/workspace/files", cancelled
            ).entries
            if entry.kind == "file" and entry.name.lower().endswith(".geojson")
        ]

    def _output(self, workspace, output_id):
        output = self.analysis.repository.workspace_output(workspace, output_id)
        resolved = _resolved_review(output)
        if resolved is not None:
            return output, *resolved
        raise AnalysisError(
            "REVIEW_RESULT_UNSUPPORTED", "该成果契约未声明对象核查。", 422
        )


def _dataset_objects(data, extent, profile, source, query, cancelled):
    if (
        not isinstance(data, dict)
        or data.get("type") != "FeatureCollection"
        or not isinstance(features := data.get("features"), list)
        or len(features) > MAX_VECTOR_FEATURES
    ):
        raise AnalysisError(
            "INVALID_REVIEW_DATASET",
            f"{source} 须为 GeoJSON FeatureCollection，最多 20,000 个要素。",
            422,
        )
    metadata = data.get("source")
    attribution = metadata.get("attribution") if isinstance(metadata, dict) else None
    attribution = attribution[:200] if isinstance(attribution, str) else None
    objects: dict[tuple[Kind, str], list[BaseGeometry]] = defaultdict(list)
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
        if extent.intersects(geometry):
            objects[kind, name.strip()].append(geometry)
    return attribution, [
        ReviewObject(name, kind, shapely.union_all(geometries))
        for (kind, name), geometries in objects.items()
    ]


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
