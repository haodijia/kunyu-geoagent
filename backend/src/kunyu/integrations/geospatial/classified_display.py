"""Render explicitly declared class codes without interpolating class colours."""

import json

import numpy as np

from kunyu.domain.geospatial.analysis import AnalysisError


def read_categories(tags: dict) -> list[dict] | None:
    raw = tags.get("KUNYU_CATEGORIES")
    if raw is None:
        return None
    try:
        entries = json.loads(raw)
        if not isinstance(entries, list) or not 1 <= len(entries) <= 256:
            raise ValueError("Invalid category count")
        seen = set()
        for entry in entries:
            if (
                set(entry) != {"value", "label", "color"}
                or not isinstance(entry["value"], int)
                or not isinstance(entry["label"], str)
            ):
                raise ValueError("Invalid category")
            if entry["value"] in seen:
                raise ValueError("Duplicate category")
            color = entry["color"]
            if not isinstance(color, str) or len(color) != 7 or color[0] != "#":
                raise ValueError("Invalid colour")
            int(color[1:], 16)
            seen.add(entry["value"])
        return entries
    except (ValueError, TypeError, KeyError) as error:
        raise AnalysisError(
            "INVALID_RASTER_CATEGORIES", "分类栅格图例无效。"
        ) from error


def classified_rgba(data, categories: list[dict]) -> np.ndarray:
    output = np.zeros((*data.shape, 4), dtype="uint8")
    valid = ~np.ma.getmaskarray(data)
    known = np.zeros(data.shape, dtype=bool)
    for entry in categories:
        pixels = valid & (data.data == entry["value"])
        color = entry["color"]
        output[pixels] = [int(color[i : i + 2], 16) for i in (1, 3, 5)] + [255]
        known |= pixels
    if (valid & ~known).any():
        raise AnalysisError("UNKNOWN_RASTER_CLASS", "分类像元未在图例中声明。")
    return output
