"""Immutable imagery candidates reference committed search tool results."""

import math

from pydantic import BaseModel, ConfigDict

from kunyu.domain.geospatial.oge import OgeImageRecord


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
