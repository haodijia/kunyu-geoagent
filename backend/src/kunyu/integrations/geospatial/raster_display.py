"""The same renderer selects arbitrary numeric source bands for every raster view."""

import numpy as np

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.integrations.geospatial.classified_display import classified_rgba

PALETTES = {
    "viridis": [
        [68, 1, 84],
        [59, 82, 139],
        [33, 145, 140],
        [94, 201, 98],
        [253, 231, 37],
    ],
    "blue": [[247, 251, 255], [107, 174, 214], [8, 48, 107]],
    "gray": [[0, 0, 0], [255, 255, 255]],
}


def display_ranges(data, style: dict) -> list[list[float]]:
    if style["type"] == "classified":
        return []
    stretch = style["stretch"]
    if stretch["method"] == "range":
        return [list(pair) for pair in stretch["ranges"]]
    ranges = []
    for channel in data:
        valid = channel.compressed()
        valid = valid[np.isfinite(valid)]
        if not valid.size:
            raise AnalysisError("EMPTY_VIEW", "所选视图没有可用于拉伸的有效像元。")
        low, high = np.percentile(valid, stretch["percentiles"]).tolist()
        if low == high:
            high = low + max(1, abs(low) * 0.01)
        ranges.append([low, high])
    return ranges


def render_rgba(data, style: dict, ranges: list) -> np.ndarray:
    values = data.astype("float64").filled(np.nan)
    valid = (~np.ma.getmaskarray(data) & np.isfinite(values)).all(axis=0)
    if style["type"] == "classified":
        band = np.ma.array(values[0], mask=~valid)
        rgba = classified_rgba(band, style["classes"])
        rgba[np.isin(values[0], style["transparent_values"]), 3] = 0
        return rgba
    normalized = np.stack(
        [
            np.clip((np.where(valid, channel, low) - low) / (high - low), 0, 1)
            for channel, (low, high) in zip(values, ranges, strict=True)
        ]
    )
    if style["type"] == "rgb":
        rgb = np.moveaxis(normalized, 0, -1) * 255
    else:
        stops = np.array(PALETTES[style["color_ramp"]])
        positions = np.linspace(0, 1, len(stops))
        rgb = np.stack(
            [np.interp(normalized[0], positions, stops[:, i]) for i in range(3)],
            axis=-1,
        )
    return np.dstack((rgb.astype("uint8"), valid.astype("uint8") * 255))
