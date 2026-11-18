"""Join workspace GeoJSON objects to a matching water-change result."""

import json
from collections import defaultdict
from threading import Event
from typing import Literal

import shapely
from shapely.errors import GEOSException
from shapely.geometry import box, shape
from shapely.geometry.base import BaseGeometry

from kunyu.application.analysis.analysis import AnalysisService
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.water_review import WaterReview
from kunyu.domain.workspaces.filesystem import FilesystemError
from kunyu.integrations.filesystem.browse import WorkspaceBrowser
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.geospatial.water_review import (
    MAX_FEATURE_COORDINATES,
    ReviewObject,
    measure_objects,
)

Kind = Literal["park", "road"]
MAX_VECTOR_BYTES = 4 * 1024 * 1024
MAX_VECTOR_FILES = 16
MAX_VECTOR_FEATURES = 20_000
OBJECT_TYPES = {
    "park": ("Polygon", "MultiPolygon"),
    "road": ("LineString", "MultiLineString"),
}


class WaterReviewService:
    def __init__(self, analysis: AnalysisService) -> None:
        self.analysis = analysis
        self.files = WorkspaceBrowser(analysis.raster.root.parent)

    def inspect(
        self, workspace: str, output_id: str, query: str, cancelled: Event
    ) -> WaterReview:
        repository = self.analysis.repository
        output = repository.workspace_output(workspace, output_id)
        bands = {band["name"]: band["index"] for band in output.metadata["bands"]}
        if not {"change_class", "stable_flood"} <= bands.keys():
            raise AnalysisError(
                "REVIEW_RESULT_UNSUPPORTED",
                "该成果没有双期水体变化和阈值一致性波段。",
                422,
            )
        datasets, objects = self._objects(
            workspace, box(*output.bounds), query, cancelled
        )
        if not objects:
            return WaterReview(output_id=output_id, datasets=datasets, items=[])
        cog, _ = repository.files(workspace, output_id)
        items = measure_objects(
            self.analysis.raster.path(cog),
            bands["change_class"],
            bands["stable_flood"],
            objects,
            cancelled,
        )
        # Area and centerline length are only ranked within the same feature type.
        selected = []
        for kind in ("park", "road"):
            ranked = sorted(
                (
                    item
                    for item in items
                    if item.kind == kind
                    and (
                        query
                        or item.candidate > 0
                        or item.missing > 0
                        or item.disagreement > 0
                    )
                ),
                key=lambda item: (
                    -item.stable,
                    -item.candidate,
                    -item.missing,
                    -item.disagreement,
                    item.name,
                ),
            )
            selected.extend(ranked[:5])
        return WaterReview(output_id=output_id, datasets=datasets, items=selected)

    def _objects(self, workspace, extent, query, cancelled):
        listing = self.files.list(workspace, "/workspace/files", cancelled)
        entries = [
            entry
            for entry in listing.entries
            if entry.kind == "file" and entry.name.lower().endswith(".geojson")
        ]
        if len(entries) > MAX_VECTOR_FILES:
            raise AnalysisError(
                "REVIEW_TOO_MANY_DATASETS", "工作区的 GeoJSON 文件超过 16 个。", 422
            )
        datasets = []
        objects = []
        for entry in entries:
            check_cancelled(cancelled, "read review dataset")
            try:
                with self.files.open(
                    workspace, entry.file_path, MAX_VECTOR_BYTES
                ) as content:
                    data = json.loads(b"".join(content.chunks))
            except (FilesystemError, UnicodeError, ValueError, RecursionError) as error:
                raise AnalysisError(
                    "INVALID_REVIEW_DATASET",
                    f"无法读取 {entry.name}。请检查文件格式和大小（最多 4 MiB）。",
                    422,
                ) from error
            matching, overlapping = _dataset_objects(
                data, extent, entry.name, query, cancelled
            )
            if overlapping:
                datasets.append(entry.name)
                objects.extend(matching)
        return datasets, objects


def _dataset_objects(
    data, extent: BaseGeometry, source: str, query: str, cancelled: Event
):
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
    overlapping = False
    for feature in features:
        check_cancelled(cancelled, "read vector features")
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise AnalysisError(
                "INVALID_REVIEW_DATASET", f"{source} 存在无效要素。", 422
            )
        properties = feature.get("properties")
        raw = feature.get("geometry")
        if not isinstance(properties, dict) or not isinstance(raw, dict):
            continue
        name = properties.get("name:zh") or properties.get("name")
        kind = _object_kind(properties)
        if (
            not isinstance(name, str)
            or not name.strip()
            or len(name) > 160
            or kind is None
        ):
            continue
        if raw.get("type") not in OBJECT_TYPES[kind]:
            continue
        geometry = _geometry(raw, source)
        if not extent.intersects(geometry):
            continue
        overlapping = True
        if query and query.casefold() not in name.casefold():
            continue
        objects[kind, name.strip()].append(geometry)
    return [
        ReviewObject(name, kind, source, attribution, shapely.union_all(geometries))
        for (kind, name), geometries in objects.items()
    ], overlapping


def _object_kind(properties: dict) -> Kind | None:
    if properties.get("category") == "park" or properties.get("leisure") == "park":
        return "park"
    if properties.get("category") != "road" and not properties.get("highway"):
        return None
    if any(properties.get(key, "no") != "no" for key in ("bridge", "tunnel")):
        return None
    if str(properties.get("layer", "0")) != "0":
        return None
    return "road"


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
