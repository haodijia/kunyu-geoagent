"""Session analysis jobs and map state referencing workspace-owned raster outputs."""

from datetime import datetime
from typing import Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    field_validator,
    model_validator,
)
from pydantic.json_schema import SkipJsonSchema

from kunyu.domain.execution.jobs import JobStage
from kunyu.domain.geospatial.imagery import LayerImage

EXECUTING_STATES = ("submitting", "queued", "running", "collecting")


class AnalysisError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 409) -> None:
        self.code, self.status = code, status
        super().__init__(message)


class AnalysisValue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, from_attributes=True)


class AnalysisJob(AnalysisValue):
    id: str
    session_id: str
    workspace_id: str
    run_id: str | None
    tool_call_id: str
    mode: Literal["replay", "live"]
    service: str
    state: Literal[
        "submitting",
        "queued",
        "running",
        "collecting",
        "succeeded",
        "failed",
        "submission_unknown",
    ]
    query_state: Literal["ready", "auth_required", "disconnected"]
    stage: JobStage
    remote_id: str | None
    parameters: dict[str, JsonValue]
    revision: int
    error_code: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class AnalysisOutput(AnalysisValue):
    id: str
    job_id: str | None
    workspace_id: str
    session_id: str | None
    source_session_title: str
    file_path: str
    preview_path: str
    title: str
    mode: Literal["replay", "live"]
    kind: Literal["raster"]
    metadata: dict[str, JsonValue]
    source_metadata: dict[str, JsonValue]
    bounds: tuple[float, float, float, float]
    original_status: int
    revision: int
    created_at: datetime


class MapLayer(AnalysisValue):
    id: str
    session_id: str
    output_id: str | None
    view_id: str | None
    image: LayerImage | None
    bounds: tuple[float, float, float, float] | None
    title: str
    visible: bool
    opacity: float = Field(ge=0, le=1, allow_inf_nan=False)
    position: int
    revision: int

    @model_validator(mode="after")
    def source(self) -> Self:
        if (self.output_id is None) == (self.image is None):
            raise ValueError("A map layer must reference exactly one output or image.")
        if (self.output_id is None) != (self.view_id is None):
            raise ValueError("Raster layers require a view; image layers have no view.")
        return self


class LayerStyleWrite(AnalysisValue):
    visible: bool | SkipJsonSchema[None] = None
    opacity: float | SkipJsonSchema[None] = Field(
        default=None, ge=0, le=1, allow_inf_nan=False
    )
    position: int | SkipJsonSchema[None] = Field(default=None, ge=0, le=1000)

    @field_validator("visible", "opacity", "position")
    @classmethod
    def non_null(cls, value):
        if value is None:
            raise ValueError("Omit unchanged style fields; values cannot be null.")
        return value

    @model_validator(mode="after")
    def changes(self) -> Self:
        if self.visible is None and self.opacity is None and self.position is None:
            raise ValueError("Supply at least one style field.")
        return self
