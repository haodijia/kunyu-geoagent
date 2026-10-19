"""Immutable imagery candidates reference committed search tool results."""

import math

from pydantic import BaseModel, ConfigDict, Field

from kunyu.domain.geospatial.oge import OgeImageRecord


class LayerImage(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    candidate_set_id: str = Field(min_length=1, max_length=128)
    image_id: int = Field(gt=0)
    product_name: str
    acquired_at: str
    resolution: str | None
    cloud: float | None
    footprint: list[list[float]] | None


def layer_image(candidate_set_id: str, image: OgeImageRecord) -> LayerImage:
    return LayerImage(
        candidate_set_id=candidate_set_id,
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


class ImageCandidates(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str
    session_id: str
    images: tuple[OgeImageRecord, ...]


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


def candidate_bounds(
    candidates: ImageCandidates,
) -> tuple[float, float, float, float] | None:
    points = [
        point
        for image in candidates.images
        if (ring := image_ring(image)) is not None
        for point in ring
    ]
    if not points:
        return None
    return (
        min(point[0] for point in points),
        min(point[1] for point in points),
        max(point[0] for point in points),
        max(point[1] for point in points),
    )
