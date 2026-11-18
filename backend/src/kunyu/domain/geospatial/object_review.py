"""Contract and results for object-level review of a classified raster."""

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
    name: str
    file_path: str


class ObjectReviewItem(BaseModel):
    name: str
    kind: Literal["area", "line"]
    geometry: dict[str, JsonValue]
    bounds: tuple[float, float, float, float]
    extent: float
    covered: float
    candidate: float
    evidence: float | None
    missing: float
    ambiguous: float


class ObjectReview(BaseModel):
    output_id: str
    dataset: ReviewDataset
    attribution: str | None
    profile: ObjectReviewProfile
    items: list[ObjectReviewItem]
