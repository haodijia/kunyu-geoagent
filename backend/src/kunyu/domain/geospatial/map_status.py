"""Ephemeral rendering facts reported by an open map client."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LayerRenderStatus(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    layer_id: str = Field(min_length=1, max_length=64)
    revision: int = Field(ge=1)
    state: Literal["hidden", "loading", "ready", "failed"]
    error: str | None = Field(default=None, max_length=1000)


class MapRenderStatus(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    state: Literal["closed", "loading", "ready", "failed"]
    layers: list[LayerRenderStatus] = Field(max_length=1000)
    error: str | None = Field(default=None, max_length=1000)
