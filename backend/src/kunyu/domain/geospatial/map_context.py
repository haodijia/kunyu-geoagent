"""Frozen map references attached to user input and turn snapshots."""

from pydantic import BaseModel, ConfigDict, Field, JsonValue


class MapViewportInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    zoom: float = Field(ge=0, le=24, allow_inf_nan=False)


class TurnMapContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: str = Field(min_length=1, max_length=64)
    viewport: MapViewportInput
    event_id: None = None
    selected_aoi_id: None = None
    selected_feature: None = None
    visible_layer_ids: list[JsonValue] = Field(default_factory=list, max_length=0)
    active_result_layer_id: None = None
    active_observation_id: None = None
    comparison_observation_ids: list[JsonValue] = Field(
        default_factory=list, max_length=0
    )
