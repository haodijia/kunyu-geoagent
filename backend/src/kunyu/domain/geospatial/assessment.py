"""Frozen research areas, declared methods and reproducible assessment receipts."""

from datetime import date, datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator


class AssessmentValue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class StudyAreaWrite(AssessmentValue):
    name: str = Field(min_length=1, max_length=120)
    geometry: dict[str, JsonValue]
    expected_revision: int = Field(ge=0)


class StudyArea(AssessmentValue):
    workspace_id: str
    name: str
    geometry: dict[str, JsonValue]
    revision: int
    area_m2: float
    updated_at: datetime


class AssessmentRequest(AssessmentValue):
    operation_id: UUID
    title: str = Field(min_length=1, max_length=120)
    area_revision: int = Field(ge=1)
    before_output_id: str = Field(min_length=1, max_length=64)
    after_output_id: str = Field(min_length=1, max_length=64)
    before_scl_output_id: str = Field(min_length=1, max_length=64)
    after_scl_output_id: str = Field(min_length=1, max_length=64)
    before_date: date
    after_date: date
    threshold: float = Field(ge=-1, le=1, allow_inf_nan=False)
    calibration: str = Field(min_length=1, max_length=4000)
    method_status: Literal["exploratory", "calibrated"]
    min_patch_area_m2: float = Field(ge=0, le=1_000_000, allow_inf_nan=False)
    event_context: str = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def temporal_pair(self) -> Self:
        if self.before_date >= self.after_date:
            raise ValueError(
                "The earlier observation must precede the later observation."
            )
        ids = (
            self.before_output_id,
            self.after_output_id,
            self.before_scl_output_id,
            self.after_scl_output_id,
        )
        if len(set(ids)) != 4:
            raise ValueError("Four distinct index and quality outputs are required.")
        return self


class AssessmentArtifact(AssessmentValue):
    filename: str
    media_type: str
    label: str


class Assessment(AssessmentValue):
    id: str
    workspace_id: str
    session_id: str | None
    status: Literal["building", "succeeded", "failed"]
    request: AssessmentRequest
    area: StudyArea
    sources: list[dict[str, JsonValue]]
    result_directory: str
    output_id: str | None = None
    metrics: dict[str, JsonValue] = Field(default_factory=dict)
    artifacts: list[AssessmentArtifact] = Field(default_factory=list)
    error: str | None = None
    created_at: datetime
