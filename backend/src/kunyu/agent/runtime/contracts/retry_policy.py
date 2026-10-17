"""Provider-owned, immutable retry policy; executed only at Agent boundaries."""

import json
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator


class RetryBackoff(BaseModel):
    model_config = ConfigDict(
        extra="forbid", frozen=True, allow_inf_nan=False, validate_default=True
    )
    initial_delay_ms: float = Field(default=500, gt=0, le=2_147_483_647, strict=True)
    max_delay_ms: float = Field(default=10_000, gt=0, le=2_147_483_647, strict=True)
    jitter_ratio: float = Field(default=0.1, ge=0, le=1, strict=True)

    @model_validator(mode="after")
    def validate_delay(self) -> Self:
        if self.initial_delay_ms > self.max_delay_ms:
            raise ValueError("Initial retry delay must not exceed the maximum delay.")
        return self


class NormalRetryPolicy(RetryBackoff):
    mode: Literal["normal"] = "normal"
    max_retries: int = Field(default=5, ge=0, le=9_007_199_254_740_991, strict=True)
    retryable_codes: tuple[Annotated[str, Field(min_length=1, max_length=128)], ...] = (
        "MODEL_EMPTY_RESPONSE",
        "PROVIDER_RATE_LIMIT",
        "PROVIDER_SERVER",
        "PROVIDER_TIMEOUT",
        "PROVIDER_NETWORK",
    )

    @model_validator(mode="after")
    def validate_codes(self) -> Self:
        if not self.retryable_codes or len(set(self.retryable_codes)) != len(
            self.retryable_codes
        ):
            raise ValueError("Retry codes must be nonempty and unique.")
        return self


class AlwaysRetryPolicy(RetryBackoff):
    mode: Literal["always"] = "always"


type RetryPolicy = Annotated[
    NormalRetryPolicy | AlwaysRetryPolicy, Field(discriminator="mode")
]
RETRY_POLICY = TypeAdapter(RetryPolicy)
DEFAULT_RETRY_POLICY = NormalRetryPolicy()


def retry_policy_key(policy: RetryPolicy) -> str:
    fields: list[object] = [policy.mode]
    if isinstance(policy, NormalRetryPolicy):
        fields.extend((policy.max_retries, sorted(policy.retryable_codes)))
    fields.extend((policy.initial_delay_ms, policy.max_delay_ms, policy.jitter_ratio))
    return json.dumps(fields, separators=(",", ":"))
