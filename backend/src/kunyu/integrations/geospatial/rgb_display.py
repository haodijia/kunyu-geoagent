"""Stretch RGB display pixels without converting the source raster."""

import numpy as np

from kunyu.domain.geospatial.analysis import AnalysisError


def rgb_ranges(data) -> list[list[float]]:
    ranges = []
    for band in data:
        valid = band.compressed()
        valid = valid[np.isfinite(valid)]
        if not len(valid):
            raise AnalysisError(
                "EMPTY_RASTER", "An RGB band has no finite display values."
            )
        minimum, maximum = np.percentile(valid, [2, 98]).tolist()
        if minimum == maximum:
            maximum = minimum + max(1, abs(minimum) * 0.01)
        ranges.append([float(minimum), float(maximum)])
    return ranges


def rgb_rgba(data, mask, ranges):
    channels = []
    valid = mask > 0
    for band, (minimum, maximum) in zip(data, ranges, strict=True):
        values = band.astype("float64").filled(np.nan)
        finite = np.isfinite(values) & ~np.ma.getmaskarray(band)
        valid &= finite
        scaled = (np.where(finite, values, minimum) - minimum) / (maximum - minimum)
        channels.append(np.rint(np.clip(scaled, 0, 1) * 255).astype("uint8"))
    return np.dstack((*channels, valid.astype("uint8") * 255))
