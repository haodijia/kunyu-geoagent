"""A numeric raster has bands; views select bands and declare their presentation."""

import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RasterValue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class RasterBand(RasterValue):
    index: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1000)
    unit: str | None = Field(default=None, max_length=80)


class RasterCategory(RasterValue):
    value: int
    label: str = Field(min_length=1, max_length=100)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class RangeStretch(RasterValue):
    method: Literal["range"]
    ranges: list[tuple[float, float]] = Field(min_length=1)

    @model_validator(mode="after")
    def finite_ranges(self):
        if any(
            not math.isfinite(a) or not math.isfinite(b) or a >= b
            for a, b in self.ranges
        ):
            raise ValueError("Display ranges must be finite and increasing.")
        return self


class PercentileStretch(RasterValue):
    method: Literal["percentile"]
    percentiles: tuple[float, float]

    @model_validator(mode="after")
    def percentiles_in_order(self):
        a, b = self.percentiles
        if not 0 <= a < b <= 100:
            raise ValueError("Percentiles must satisfy 0 <= low < high <= 100.")
        return self


Stretch = Annotated[RangeStretch | PercentileStretch, Field(discriminator="method")]


class ContinuousStyle(RasterValue):
    type: Literal["continuous"]
    color_ramp: Literal["viridis", "blue", "gray"]
    stretch: Stretch


class RGBStyle(RasterValue):
    type: Literal["rgb"]
    stretch: Stretch


class ClassifiedStyle(RasterValue):
    type: Literal["classified"]
    classes: list[RasterCategory] = Field(min_length=1)
    transparent_values: list[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def classes_are_unique(self):
        values = [item.value for item in self.classes]
        if len(set(values)) != len(values) or not set(self.transparent_values) <= set(
            values
        ):
            raise ValueError(
                "Classes must be unique; transparent values must be declared."
            )
        return self


RasterStyle = Annotated[
    ContinuousStyle | RGBStyle | ClassifiedStyle, Field(discriminator="type")
]


class RasterView(RasterValue):
    id: str = Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_-]{0,63}$")
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1000)
    group: str = Field(min_length=1, max_length=60)
    bands: list[Annotated[int, Field(ge=1)]] = Field(min_length=1)
    style: RasterStyle

    @model_validator(mode="after")
    def channels(self):
        count = 3 if self.style.type == "rgb" else 1
        if len(self.bands) != count:
            raise ValueError(
                f"{self.style.type} views require {count} band selection(s)."
            )
        if (
            self.style.type != "classified"
            and self.style.stretch.method == "range"
            and len(self.style.stretch.ranges) != count
        ):
            raise ValueError("Each display channel requires one range.")
        return self


class RasterPresentation(RasterValue):
    bands: list[RasterBand] = Field(min_length=1)
    views: list[RasterView] = Field(min_length=1)
    default_view: str

    @model_validator(mode="after")
    def references(self):
        indices = [band.index for band in self.bands]
        names = [band.name for band in self.bands]
        ids = [view.id for view in self.views]
        if indices != list(range(1, len(indices) + 1)) or len(set(names)) != len(names):
            raise ValueError(
                "Describe every band once, in index order, with a unique name."
            )
        if len(set(ids)) != len(ids) or self.default_view not in ids:
            raise ValueError("View IDs must be unique and default_view must exist.")
        if any(index not in indices for view in self.views for index in view.bands):
            raise ValueError("A view references an undeclared band.")
        return self


def raster_view(metadata: dict, view_id: str | None = None) -> dict:
    from kunyu.domain.geospatial.analysis import AnalysisError

    identity = metadata["default_view"] if view_id is None else view_id
    for view in metadata["views"]:
        if view["id"] == identity:
            return view
    raise AnalysisError("VIEW_NOT_FOUND", "该栅格没有此展示视图。", 404)


class RasterReference(RasterValue):
    output_id: str = Field(min_length=1, max_length=64)
    view_id: str = Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_-]{0,63}$")
