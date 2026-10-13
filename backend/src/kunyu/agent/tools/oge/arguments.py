"""Typed model-facing OGE inputs, translated into form and JSON requests."""

import json
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

from kunyu.agent.tools.shared import ToolArguments


class _Region(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class AdministrativeRegion(_Region):
    type: Literal["administrative"]
    code: str = Field(
        min_length=1,
        max_length=64,
        description="OGE region code returned by oge_find_regions.",
    )
    level: int = Field(
        ge=0,
        le=4,
        description="OGE level returned by oge_find_regions; county level is 4.",
    )


class PolygonRegion(_Region):
    type: Literal["polygon"]
    points: list[list[float]] = Field(
        min_length=4,
        max_length=500,
        description="Closed WGS84 ring of [longitude, latitude] pairs.",
    )

    @model_validator(mode="after")
    def coordinates(self) -> Self:
        if any(
            len(point) != 2 or not -180 <= point[0] <= 180 or not -90 <= point[1] <= 90
            for point in self.points
        ):
            raise ValueError("Polygon requires WGS84 longitude/latitude pairs.")
        if (
            self.points[0] != self.points[-1]
            or len({tuple(point) for point in self.points[:-1]}) < 3
        ):
            raise ValueError(
                "Polygon requires a closed ring with at least three distinct vertices."
            )
        return self


class BoundingBoxRegion(_Region):
    type: Literal["bbox"]
    west: float = Field(ge=-180, le=180)
    south: float = Field(ge=-90, le=90)
    east: float = Field(ge=-180, le=180)
    north: float = Field(ge=-90, le=90)

    @model_validator(mode="after")
    def extent(self) -> Self:
        if self.west >= self.east or self.south >= self.north:
            raise ValueError("Bounding box must have west < east and south < north.")
        return self


class CloudRange(_Region):
    minimum: float = Field(ge=0, le=100)
    maximum: float = Field(ge=0, le=100)

    @model_validator(mode="after")
    def range(self) -> Self:
        if self.minimum > self.maximum:
            raise ValueError("Cloud minimum must not exceed maximum.")
        return self


class SearchImagesArguments(ToolArguments):
    start_time: str = Field(
        pattern=r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$",
        description="Start of acquisition interval: yyyy-MM-dd HH:mm:ss.",
    )
    end_time: str = Field(
        pattern=r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$",
        description="End of acquisition interval: yyyy-MM-dd HH:mm:ss.",
    )
    region: Annotated[
        AdministrativeRegion | PolygonRegion | BoundingBoxRegion,
        Field(discriminator="type"),
    ]
    product_ids: list[Annotated[int, Field(gt=0)]] | None = Field(
        default=None, min_length=1, max_length=20
    )
    cloud: CloudRange | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=10, ge=1, le=10)

    @model_validator(mode="after")
    def interval(self) -> Self:
        start = datetime.strptime(self.start_time, "%Y-%m-%d %H:%M:%S")
        end = datetime.strptime(self.end_time, "%Y-%m-%d %H:%M:%S")
        if start > end:
            raise ValueError("Start time must not exceed end time.")
        return self

    def form(self) -> dict[str, str]:
        fields = {
            "startTime": self.start_time,
            "endTime": self.end_time,
            "pageNum": str(self.page),
            "pageSize": str(self.page_size),
            "useCloud": "true" if self.cloud is not None else "false",
        }
        if isinstance(self.region, AdministrativeRegion):
            fields.update(type="0", code=self.region.code, level=str(self.region.level))
        elif isinstance(self.region, PolygonRegion):
            fields.update(
                type="1", points=json.dumps(self.region.points, separators=(",", ":"))
            )
        else:
            fields.update(
                type="3",
                minx=str(self.region.west),
                miny=str(self.region.south),
                maxx=str(self.region.east),
                maxy=str(self.region.north),
            )
        if self.product_ids is not None:
            fields["productIds"] = ",".join(str(value) for value in self.product_ids)
        if self.cloud is not None:
            fields.update(
                minCloud=str(self.cloud.minimum), maxCloud=str(self.cloud.maximum)
            )
        return fields


class ImageArguments(ToolArguments):
    image_id: int = Field(
        gt=0, description="Numeric imageId from OGE retrieval results."
    )


class ListMyDataArguments(ToolArguments):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=10, ge=1, le=10)
    keywords: str | None = Field(default=None, min_length=1, max_length=200)
    data_type: Literal["grid", "vector", "other"] | None = None

    def body(self) -> dict[str, JsonValue]:
        body: dict[str, JsonValue] = {
            "pageNumber": self.page,
            "pageSize": self.page_size,
        }
        if self.keywords is not None:
            body["keywords"] = self.keywords
        if self.data_type is not None:
            body["dataType"] = self.data_type
        return body


class MyDataDetailArguments(ToolArguments):
    asset_uuid: str = Field(
        pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        description="assetUuid returned by oge_list_my_data, not a numeric assetId.",
    )


class FindRegionsArguments(ToolArguments):
    query: str = Field(
        min_length=1,
        max_length=100,
        description="Administrative region name, in Chinese or English.",
    )
    parent_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        description="Exact name of an ancestor, to disambiguate names.",
    )
    match_mode: Literal["exact", "contains"] = "contains"
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=10, ge=1, le=20)
