"""Explicit band meanings shared by remote services, rendering and statistics."""

import math

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class RasterCategory(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    value: int
    label: str = Field(min_length=1, max_length=100)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class RasterProduct(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    name: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1000)
    group: str = Field(default="分析成果", min_length=1, max_length=60)
    display_range: tuple[float, float]
    categories: list[RasterCategory] | None = None
    transparent_values: list[int] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def reserved_name(cls, value: str) -> str:
        if value == "result":
            raise ValueError(
                "The product name 'result' is reserved for the original bundle."
            )
        return value

    @model_validator(mode="after")
    def ranges(self):
        low, high = self.display_range
        if not math.isfinite(low) or not math.isfinite(high) or low >= high:
            raise ValueError("Display range must contain two increasing finite values.")
        if self.categories is not None:
            values = [category.value for category in self.categories]
            if not values or len(values) != len(set(values)):
                raise ValueError("Category values must be nonempty and unique.")
            if not set(self.transparent_values) <= set(values):
                raise ValueError("Transparent values must be declared categories.")
        elif self.transparent_values:
            raise ValueError("Transparent values require categories.")
        return self
