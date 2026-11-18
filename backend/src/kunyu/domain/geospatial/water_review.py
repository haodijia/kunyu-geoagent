"""Evidence for a named object overlaid with a water-change raster."""

from typing import Literal

from pydantic import BaseModel, JsonValue


class WaterReviewItem(BaseModel):
    name: str
    kind: Literal["park", "road"]
    source: str
    attribution: str | None
    geometry: dict[str, JsonValue]
    bounds: tuple[float, float, float, float]
    extent: float
    covered: float
    candidate: float
    stable: float
    missing: float
    disagreement: float


class WaterReview(BaseModel):
    output_id: str
    datasets: list[str]
    items: list[WaterReviewItem]
