"""Explicit per-model generation and input declarations."""

from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from kunyu.domain.model_images import ModelImageInput
from kunyu.domain.model_reasoning import ModelReasoningSettings

DEFAULT_MODEL_OUTPUT_TOKENS = 16_384
MAX_MODEL_OUTPUT_TOKENS = 100_000_000
DEFAULT_RETENTION_TOKENS = 2048


class ModelSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    max_output_tokens: int = Field(gt=0, le=MAX_MODEL_OUTPUT_TOKENS)
    image_input: ModelImageInput
    reasoning_settings: ModelReasoningSettings | None
    context_window: int | None = Field(gt=0, le=100_000_000)
    retention_tokens: int = Field(ge=0, le=100_000_000)

    @model_validator(mode="after")
    def validate_window(self) -> Self:
        if (
            self.context_window is not None
            and self.max_output_tokens + self.retention_tokens >= self.context_window
        ):
            raise ValueError(
                "Context window must leave room beyond output and retained history."
            )
        return self
