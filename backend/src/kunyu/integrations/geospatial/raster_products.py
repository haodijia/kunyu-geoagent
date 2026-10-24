"""Materialize named numerical bands without rerunning or changing an algorithm."""

import json
import os
from threading import Event

import numpy as np
import rasterio

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.products import RasterProduct
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.geospatial.analysis_raster import AnalysisRaster


def prepare_products(
    raster: AnalysisRaster,
    workspace_id: str,
    name: str,
    definitions: list[RasterProduct],
    cancelled: Event,
) -> list[dict]:
    directory = raster.directory(workspace_id, name)
    preview_directory = raster.preview_path(workspace_id, name).parent
    products = []
    with rasterio.open(directory / "result.tif") as src:
        names = [item.name for item in definitions]
        if len(set(names)) != len(names) or tuple(names) != src.descriptions:
            raise AnalysisError(
                "RESULT_BANDS_MISMATCH",
                "服务成果波段与声明不一致；请核对已发布的方法版本。",
            )
        if src.crs is None or any(
            not (
                np.issubdtype(np.dtype(t), np.integer)
                or np.issubdtype(np.dtype(t), np.floating)
            )
            for t in src.dtypes
        ):
            raise AnalysisError("INVALID_RASTER", "成果必须为有空间参考的数值栅格。")
        for index, definition in enumerate(definitions, 1):
            check_cancelled(cancelled, "prepare raster products")
            values = src.read(index, masked=True)
            valid = ~np.ma.getmaskarray(values) & np.isfinite(values.data)
            observed = values.data[valid]
            metadata = definition.model_dump(mode="json")
            summary = {
                "valid_pixels": int(valid.sum()),
                "minimum": None,
                "maximum": None,
                "mean": None,
                "categories": [],
            }
            if observed.size:
                summary.update(
                    minimum=float(observed.min()),
                    maximum=float(observed.max()),
                    mean=float(observed.astype("float64").mean()),
                )
            if definition.categories is not None:
                unique, counts = np.unique(observed, return_counts=True)
                allowed = {item.value for item in definition.categories}
                if not set(unique.tolist()) <= allowed:
                    raise AnalysisError(
                        "RESULT_CLASS_MISMATCH", f"{definition.name}含有未声明的类别。"
                    )
                frequencies = dict(zip(unique.tolist(), counts.tolist()))
                summary["categories"] = [
                    {**item.model_dump(), "pixel_count": frequencies.get(item.value, 0)}
                    for item in definition.categories
                ]
            # Area is explicitly grid-based and only available for a metre CRS.
            if src.crs.is_projected and src.crs.linear_units == "metre":
                summary["grid_pixel_area_m2"] = abs(src.transform.determinant)
            path = directory / f"{definition.name}.tif"
            temporary = path.with_suffix(".partial.tif")
            profile = src.profile.copy()
            profile.update(count=1, compress="deflate", photometric="minisblack")
            try:
                with (
                    rasterio.Env(GDAL_TIFF_INTERNAL_MASK=True),
                    rasterio.open(temporary, "w", **profile) as dst,
                ):
                    dst.write(values.data, 1)
                    dst.write_mask(valid.astype("uint8") * 255)
                    dst.set_band_description(1, definition.name)
                    tags = {
                        "KUNYU_DISPLAY_RANGE": json.dumps([definition.display_range]),
                        "KUNYU_TRANSPARENT_VALUES": json.dumps(
                            definition.transparent_values
                        ),
                    }
                    if definition.categories is not None:
                        tags["KUNYU_CATEGORIES"] = json.dumps(
                            metadata["categories"], ensure_ascii=False
                        )
                    dst.update_tags(**tags)
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
            preview = preview_directory / f"{definition.name}.png"
            prepared = raster.prepare_file(path, preview, cancelled)
            products.append(
                {
                    "name": definition.name,
                    "title": definition.title,
                    "metadata": {
                        **prepared,
                        "product_name": definition.name,
                        "group": definition.group,
                        "description": definition.description,
                        "summary": summary,
                    },
                    "file": str(path.relative_to(raster.root)),
                    "preview": str(preview.relative_to(raster.root)),
                }
            )
    return products
