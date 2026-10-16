"""Session analysis jobs and map state referencing workspace-owned raster outputs."""

from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

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
    remote_id: str | None
    parameters: dict[str, JsonValue]
    revision: int
    error_code: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class AnalysisOutput(AnalysisValue):
    id: str
    job_id: str
    workspace_id: str
    session_id: str
    title: str
    mode: Literal["replay", "live"]
    kind: Literal["rgb_raster", "scalar_raster"]
    metadata: dict[str, JsonValue]
    source_metadata: dict[str, JsonValue]
    bounds: tuple[float, float, float, float]
    original_status: int
    revision: int
    created_at: datetime


class MapViewport(AnalysisValue):
    longitude: float = Field(default=108.521, ge=-180, le=180, allow_inf_nan=False)
    latitude: float = Field(
        default=25.932, ge=-85.0511287798066, le=85.0511287798066, allow_inf_nan=False
    )
    zoom: float = Field(default=11, ge=0, le=24, allow_inf_nan=False)


class MapCamera(AnalysisValue):
    dimension: Literal["2d", "3d"] = "2d"
    bearing: float = Field(default=0, ge=-180, le=180, allow_inf_nan=False)
    pitch: float = Field(default=0, ge=0, le=80, allow_inf_nan=False)

    @model_validator(mode="after")
    def dimension_pitch(self) -> Self:
        if self.dimension == "2d" and self.pitch != 0:
            raise ValueError("A 2D camera must have zero pitch.")
        return self


class MapPresentation(AnalysisValue):
    request_id: str
    target: Literal["candidates", "output"]
    reference_id: str
    image_id: int | None = None
    open_map: bool
    focus: bool
    bounds: tuple[float, float, float, float] | None
    status: Literal["requested", "applied", "failed"] = "requested"
    error: str | None = None


class MapState(AnalysisValue):
    session_id: str
    revision: int
    view_revision: int = 1
    viewport: MapViewport
    camera: MapCamera
    selected_output_id: str | None = None
    focus_output_id: str | None = None
    focus_revision: int = 0
    applied_focus_revision: int = 0
    presentation: MapPresentation | None = None
    candidate_set_id: str | None = None
    selected_image_id: int | None = None


class MapViewWrite(AnalysisValue):
    expected_view_revision: int = Field(ge=1)
    applied_focus_revision: int = Field(ge=0)
    viewport: MapViewport
    camera: MapCamera


class MapLayer(AnalysisValue):
    id: str
    session_id: str
    output_id: str
    title: str
    visible: bool
    opacity: float = Field(ge=0, le=1, allow_inf_nan=False)
    position: int
    revision: int


class LayerStyleWrite(AnalysisValue):
    expected_revision: int = Field(ge=1)
    visible: bool
    opacity: float = Field(ge=0, le=1, allow_inf_nan=False)
    position: int = Field(ge=0, le=1000)
