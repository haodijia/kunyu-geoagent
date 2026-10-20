"""Image metadata and geographic bounds shared by map layers."""

import math

from pydantic import BaseModel, ConfigDict, Field

from kunyu.domain.geospatial.oge import OgeImageRecord


class LayerImage(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    image_id: int = Field(gt=0)
    product_name: str
    acquired_at: str
    resolution: str | None
    cloud: float | None
    footprint: list[list[float]] | None


def layer_image(image: OgeImageRecord) -> LayerImage:
    return LayerImage(
        image_id=image.imageId,
        product_name=image.productName,
        acquired_at=image.phenomenonTime,
        resolution=image.resolution,
        cloud=image.coverCloud,
        footprint=image_ring(image),
    )


def ring_bounds(
    ring: list[list[float]] | None,
) -> tuple[float, float, float, float] | None:
    if ring is None:
        return None
    return (
        min(p[0] for p in ring),
        min(p[1] for p in ring),
        max(p[0] for p in ring),
        max(p[1] for p in ring),
    )


def image_ring(image: OgeImageRecord) -> list[list[float]] | None:
    coordinates = [
        (image.upperLeftLong, image.upperLeftLat),
        (image.upperRightLong, image.upperRightLat),
        (image.lowerRightLong, image.lowerRightLat),
        (image.lowerLeftLong, image.lowerLeftLat),
    ]
    if any(
        x is None
        or y is None
        or not math.isfinite(x)
        or not math.isfinite(y)
        or not -180 <= x <= 180
        or not -90 <= y <= 90
        for x, y in coordinates
    ):
        return None
    return [[x, y] for x, y in (*coordinates, coordinates[0])]
