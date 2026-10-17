"""Model catalog results and operation conflicts."""

from dataclasses import dataclass
from datetime import datetime

from kunyu.domain.models.model_connections import CheckStatus, ModelConnection
from kunyu.integrations.model.provider_client import ProviderConfig


class DiscoverySupersededError(RuntimeError):
    pass


class CheckSupersededError(RuntimeError):
    pass


class ManualModelExistsError(ValueError):
    pass


class ManualModelNotFoundError(LookupError):
    def __init__(self, model_id: str) -> None:
        self.model_id = model_id
        super().__init__(f"Manual model '{model_id}' was not found.")


@dataclass(frozen=True, slots=True)
class DiscoverySnapshot:
    connection_id: str
    revision: int
    generation: int
    provider: ProviderConfig


@dataclass(frozen=True, slots=True)
class DiscoveryResult:
    connection: ModelConnection
    generation: int
    discovered_at: datetime


@dataclass(frozen=True, slots=True)
class ModelTestResult:
    connection: ModelConnection
    model_id: str
    revision: int
    status: CheckStatus
    latency_ms: int
    error_code: str | None
