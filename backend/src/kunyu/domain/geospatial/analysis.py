"""Session analysis jobs and map state referencing workspace-owned raster outputs."""

from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

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
    kind: Literal["rgb_raster", "scalar_raster"]
    metadata: dict[str, JsonValue]
    source_metadata: dict[str, JsonValue]
    bounds: tuple[float, float, float, float]
    original_status: int
    revision: int
    created_at: datetime


class MapPresentation(AnalysisValue):
    request_id: str
    target: Literal["images", "output"]
    reference_id: str | None
    image_ids: list[int] | None
    open_map: bool
    focus: bool
    bounds: tuple[float, float, float, float] | None


class MapLayer(AnalysisValue):
    id: str
    session_id: str
    output_id: str | None
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
        return self


class LayerStyleWrite(AnalysisValue):
    expected_revision: int = Field(ge=1)
    visible: bool
    opacity: float = Field(ge=0, le=1, allow_inf_nan=False)
    position: int = Field(ge=0, le=1000)
