"""Discover packaged vector partitions by their declared coverage."""

import json
import logging
from functools import cache, lru_cache
from pathlib import Path

from pydantic import TypeAdapter
from shapely import STRtree
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.object_review import ReviewDataset

_ROOT = Path(__file__).with_name("review_data")
MAX_VECTOR_BYTES = 4 * 1024 * 1024
logger = logging.getLogger(__name__)


@cache
def _catalog_index() -> tuple[tuple[ReviewDataset, ...], STRtree]:
    datasets = TypeAdapter(tuple[ReviewDataset, ...]).validate_json(
        (_ROOT / "catalog.json").read_bytes()
    )
    if len({entry.id for entry in datasets}) != len(datasets):
        raise ValueError("Review data catalog IDs must be unique.")
    return datasets, STRtree([box(*dataset.bounds) for dataset in datasets])


def matched_partitions(
    extent: BaseGeometry,
) -> list[tuple[ReviewDataset, BaseGeometry]]:
    datasets, index = _catalog_index()
    return [
        (datasets[position], intersection)
        for position in sorted(index.query(extent, predicate="intersects"))
        if (intersection := extent.intersection(index.geometries[position])).area > 0
    ]


@lru_cache(maxsize=8)
def vector_features(dataset: ReviewDataset) -> list[dict]:
    try:
        with (_ROOT / f"{dataset.id}.geojson").open("rb") as file:
            raw = file.read(MAX_VECTOR_BYTES + 1)
        if len(raw) > MAX_VECTOR_BYTES:
            raise ValueError("Vector partition exceeds 4 MiB.")
        data = json.loads(raw)
        if (
            not isinstance(data, dict)
            or data.get("type") != "FeatureCollection"
            or not isinstance(features := data.get("features"), list)
            or len(features) > 20_000
        ):
            raise ValueError(
                "Expected a GeoJSON FeatureCollection with at most 20,000 features."
            )
        return features
    except (OSError, UnicodeError, ValueError, RecursionError) as error:
        logger.exception("Could not read review dataset %s", dataset.id)
        raise AnalysisError(
            "REVIEW_DATASET_UNAVAILABLE", f"暂无法读取核查数据「{dataset.name}」。", 503
        ) from error
