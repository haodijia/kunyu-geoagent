"""Contract and results for object-level review of a classified raster."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator


class ReviewEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    band: str = Field(min_length=1)
    values: tuple[int, ...] = Field(min_length=1)


class ObjectReviewProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    class_view: str = Field(min_length=1)
    candidate_values: tuple[int, ...] = Field(min_length=1)
    missing_values: tuple[int, ...] = ()
    ambiguous_values: tuple[int, ...] = ()
    evidence: ReviewEvidence | None = None
    exclude_elevated_lines: bool = False
    candidate_label: str = Field(min_length=1, max_length=80)
    missing_label: str = Field(min_length=1, max_length=80)
    ambiguous_label: str = Field(min_length=1, max_length=80)
    evidence_label: str | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def valid_groups(self):
        codes = self.candidate_values + self.missing_values + self.ambiguous_values
        if len(codes) != len(set(codes)):
            raise ValueError("Object review class groups must be disjoint and unique.")
        if (self.evidence is None) != (self.evidence_label is None):
            raise ValueError("Evidence band and label must be declared together.")
        return self


class ReviewDataset(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,79}$")
    name: str
    bounds: tuple[float, float, float, float]
    attribution: str
    license: str
    license_url: str = Field(pattern=r"^https://[^\s]+$")
    snapshot_at: datetime

    @model_validator(mode="after")
    def valid_bounds(self):
        west, south, east, north = self.bounds
        if not (-180 <= west < east <= 180 and -85 <= south < north <= 85):
            raise ValueError("Review dataset requires valid WGS84 bounds.")
        return self


ObjectKind = Literal["point", "line", "area"]


class ReviewVectorProperties(BaseModel):
    name: str | None
    kind: ObjectKind
    dataset_id: str
    feature_index: int


class ReviewVector(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    geometry: dict[str, JsonValue]
    properties: ReviewVectorProperties


class ObjectVectors(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    datasets: list[ReviewDataset]
    coverage: Literal["full", "partial", "none"]
    features: list[ReviewVector]


class ObjectMeasurement(BaseModel):
    extent: float
    covered: float
    candidate: float
    evidence: float | None
    missing: float
    ambiguous: float


class ObjectReview(BaseModel):
    status: Literal["measured", "outside", "excluded"]
    measurement: ObjectMeasurement | None = None
