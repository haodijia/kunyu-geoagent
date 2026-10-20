"""Workspace ownership for turn map actions; camera state stays in the UI."""

from pydantic import BaseModel, ConfigDict, Field


class TurnMapContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: str = Field(min_length=1, max_length=64)
