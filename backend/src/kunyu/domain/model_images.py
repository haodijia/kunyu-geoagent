"""Explicit model input declarations, frozen with each admitted turn."""

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ModelImageInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    enabled: bool = False
    pixel_budget: (
        Annotated[int, Field(gt=0, le=100_000_000)] | Literal["low"] | None
    ) = None
    max_bytes: int = Field(default=2 * 1024 * 1024, gt=0, le=16 * 1024 * 1024)

    @model_validator(mode="after")
    def disabled_has_no_overrides(self) -> Self:
        if not self.enabled and (
            self.pixel_budget is not None or self.max_bytes != 2 * 1024 * 1024
        ):
            raise ValueError("Disabled image input cannot have request overrides.")
        return self
