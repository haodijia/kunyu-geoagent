"""Validate a dynamic presentation against a TIFF and prepare view-only artifacts."""

import math
from pathlib import Path
from threading import Event

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.warp import transform_bounds

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.raster import RasterPresentation
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.geospatial.raster_display import display_ranges, render_rgba


def prepare_manifest(
    path: Path,
    preview_directory: Path,
    presentation: RasterPresentation,
    cancelled: Event,
) -> dict:
    with rasterio.open(path) as src:
        if src.crs is None or any(
            not np.issubdtype(np.dtype(t), np.number)
            or np.issubdtype(np.dtype(t), np.complexfloating)
            for t in src.dtypes
        ):
            raise AnalysisError("INVALID_RASTER", "成果必须为有坐标系的实数数值栅格。")
        if src.count != len(presentation.bands):
            raise AnalysisError("RESULT_BANDS_MISMATCH", "TIFF 波段数量与说明不一致。")
        for band, actual in zip(presentation.bands, src.descriptions, strict=True):
            if actual is not None and actual != band.name:
                raise AnalysisError(
                    "RESULT_BANDS_MISMATCH",
                    f"第 {band.index} 波段实际名称 {actual} 与声明 {band.name} 不一致。",
                )
        bounds = list(transform_bounds(src.crs, "EPSG:4326", *src.bounds))
        if not all(math.isfinite(v) for v in bounds):
            raise AnalysisError("INVALID_RASTER_BOUNDS", "栅格范围不是有限数值。")
        classifications = {}
        for view in presentation.views:
            if view.style.type == "classified":
                classifications.setdefault(view.bands[0], []).append(view.style)
        bands = []
        for band in presentation.bands:
            check_cancelled(cancelled, "inspect raster bands")
            summary = summarize_band(
                src, band.index, classifications.get(band.index, []), cancelled
            )
            nodata = src.nodatavals[band.index - 1]
            bands.append(
                {
                    **band.model_dump(mode="json"),
                    "dtype": src.dtypes[band.index - 1],
                    "nodata": nodata
                    if nodata is not None and math.isfinite(nodata)
                    else None,
                    "source_name": src.descriptions[band.index - 1],
                    "source_unit": src.units[band.index - 1],
                    "scale": src.scales[band.index - 1],
                    "offset": src.offsets[band.index - 1],
                    "summary": summary,
                }
            )
        views = []
        width = min(512, src.width)
        height = max(1, round(width * src.height / src.width))
        if height > 512:
            width, height = max(1, round(width * 512 / height)), 512
        preview_directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        for view in presentation.views:
            check_cancelled(cancelled, "prepare raster view")
            definition = view.model_dump(mode="json")
            data = src.read(
                indexes=view.bands,
                out_shape=(len(view.bands), height, width),
                masked=True,
                resampling=Resampling.nearest,
            )
            ranges = display_ranges(data, definition["style"])
            rgba = render_rgba(data, definition["style"], ranges)
            preview = preview_directory / f"{view.id}.png"
            Image.fromarray(rgba).save(preview)
            views.append({**definition, "render_ranges": ranges})
        return {
            "width": src.width,
            "height": src.height,
            "band_count": src.count,
            "crs": str(src.crs),
            "bounds": bounds,
            "bands": bands,
            "views": views,
            "default_view": presentation.default_view,
        }


def summarize_band(src, index, styles, cancelled: Event) -> dict:
    count, total, minimum, maximum = 0, 0.0, None, None
    counts = {entry.value: 0 for style in styles for entry in style.classes}
    for _, window in src.block_windows(index):
        check_cancelled(cancelled, "summarize raster band")
        data = src.read(index, window=window, masked=True)
        observed = data.compressed()
        observed = observed[np.isfinite(observed)]
        if not observed.size:
            continue
        count += int(observed.size)
        total += float(observed.astype("float64").sum())
        low, high = float(observed.min()), float(observed.max())
        minimum = low if minimum is None else min(minimum, low)
        maximum = high if maximum is None else max(maximum, high)
        if styles:
            unique, frequencies = np.unique(observed, return_counts=True)
            for style in styles:
                if not set(unique.tolist()) <= {entry.value for entry in style.classes}:
                    raise AnalysisError(
                        "RESULT_CLASS_MISMATCH",
                        f"第 {index} 波段包含未在视图图例中声明的类别。",
                    )
            for value, frequency in zip(
                unique.tolist(), frequencies.tolist(), strict=True
            ):
                counts[value] += frequency
    summary = {
        "valid_pixels": count,
        "minimum": minimum,
        "maximum": maximum,
        "mean": total / count if count else None,
        "value_counts": [
            {"value": value, "pixel_count": frequency}
            for value, frequency in sorted(counts.items())
        ],
    }
    if src.crs.is_projected and src.crs.linear_units == "metre":
        summary["grid_pixel_area_m2"] = abs(src.transform.determinant)
    return summary
