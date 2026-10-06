"""Explicit per-model generation and input declarations."""

from pydantic import BaseModel, ConfigDict, Field

from kunyu.domain.model_images import ModelImageInput

DEFAULT_MODEL_OUTPUT_TOKENS = 16_384
MAX_MODEL_OUTPUT_TOKENS = 100_000_000


class ModelSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    max_output_tokens: int = Field(gt=0, le=MAX_MODEL_OUTPUT_TOKENS)
    image_input: ModelImageInput
