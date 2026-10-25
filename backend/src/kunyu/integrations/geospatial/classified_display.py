"""Render explicitly declared class codes without interpolating class colours."""

import numpy as np

from kunyu.domain.geospatial.analysis import AnalysisError


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
