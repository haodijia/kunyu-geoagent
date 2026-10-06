from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Protocol

from kunyu.agent.runtime.retry_policy import RetryPolicy
from kunyu.domain.model_images import ModelImageInput
from kunyu.domain.model_settings import DEFAULT_MODEL_OUTPUT_TOKENS


class ModelProtocol(StrEnum):
    OPENAI_COMPATIBLE = "openai_compatible"
    OPENAI_RESPONSES = "openai_responses"
    DEEPSEEK_MESSAGES = "deepseek_messages"


class ModelProviderType(StrEnum):
    OPENAI = "openai"
    DEEPSEEK = "deepseek"
    MOONSHOT = "moonshot"
    MIMO = "mimo"
    ZAI = "zai"
    SILICONFLOW = "siliconflow"
    OPENROUTER = "openrouter"
    GROQ = "groq"
    NVIDIA = "nvidia"
    TOGETHER = "together"
    DEEPINFRA = "deepinfra"
    FIREWORKS = "fireworks"
    ALIBABA = "alibaba"
    XAI = "xai"
    MISTRAL = "mistral"
    OLLAMA = "ollama"
    LM_STUDIO = "lm_studio"
    LOCALAI = "localai"
    CUSTOM = "custom"


class ModelAuthMode(StrEnum):
    API_KEY = "api_key"
    NONE = "none"


class MaxTokensField(StrEnum):
    MAX_TOKENS = "max_tokens"
    MAX_COMPLETION_TOKENS = "max_completion_tokens"


class CredentialStatus(StrEnum):
    READY = "ready"
    MISSING = "missing"


class ManagementStatus(StrEnum):
    READY = "ready"


class DiscoveryStatus(StrEnum):
    IDLE = "idle"
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    INTERRUPTED = "interrupted"


class CatalogSource(StrEnum):
    FETCHED = "fetched"
    MANUAL = "manual"


class CatalogAvailability(StrEnum):
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"


class CheckStatus(StrEnum):
    UNCHECKED = "unchecked"
    PASSED = "passed"
    FAILED = "failed"


class CapabilityStatus(StrEnum):
    UNKNOWN = "unknown"
    SUPPORTED = "supported"
    UNSUPPORTED = "unsupported"


class CapabilitySource(StrEnum):
    UNKNOWN = "unknown"
    PROVIDER_METADATA = "provider_metadata"
    PROTOCOL = "protocol"
    VALIDATION = "validation"


@dataclass(frozen=True, slots=True)
class CredentialState:
    status: CredentialStatus
    configured: bool
    updated_at: datetime | None


@dataclass(frozen=True, slots=True)
class DiscoveryState:
    status: DiscoveryStatus
    generation: int
    last_success_at: datetime | None
    error_code: str | None


@dataclass(frozen=True, slots=True)
class ModelCheck:
    status: CheckStatus
    checked_at: datetime | None
    error_code: str | None


@dataclass(frozen=True, slots=True)
class ModelCatalogEntry:
    model_id: str
    display_name: str | None
    sources: tuple[CatalogSource, ...]
    revision: int
    availability: CatalogAvailability
    enabled: bool
    text_check: ModelCheck
    tool_check: ModelCheck
    tool_capability: CapabilityStatus
    tool_capability_source: CapabilitySource
    reasoning_efforts: tuple[str, ...]
    reasoning_source: CapabilitySource
    discovered_at: datetime | None
    reasoning_default: str | None = None
    image_input: ModelImageInput = field(default_factory=ModelImageInput)
    max_output_tokens: int = DEFAULT_MODEL_OUTPUT_TOKENS

    @property
    def agent_verified(self) -> bool:
        return (
            self.text_check.status is CheckStatus.PASSED
            and self.tool_check.status is CheckStatus.PASSED
        )


@dataclass(frozen=True, slots=True)
class ModelConnection:
    id: str
    display_name: str
    provider_type: ModelProviderType
    protocol: ModelProtocol
    base_url: str
    auth_mode: ModelAuthMode
    enabled: bool
    is_default: bool
    revision: int
    default_model_id: str | None
    enabled_model_ids: tuple[str, ...]
    max_tokens_field: MaxTokensField
    include_usage: bool
    credential: CredentialState
    management_status: ManagementStatus
    discovery: DiscoveryState
    check_generation: int
    catalog: tuple[ModelCatalogEntry, ...]
    created_at: datetime
    updated_at: datetime
    retry_policy: RetryPolicy


class ModelConnectionRepository(Protocol):
    def add(self, connection: ModelConnection) -> ModelConnection: ...

    def get(self, connection_id: str) -> ModelConnection | None: ...

    def list(self) -> list[ModelConnection]: ...

    def update(self, connection: ModelConnection) -> ModelConnection: ...

    def set_default(
        self, connection_id: str, updated_at: datetime
    ) -> ModelConnection | None: ...

    def delete(self, connection_id: str) -> bool: ...


class ModelCredentialRepository(Protocol):
    def get_api_key(self, connection_id: str) -> str | None: ...

    def set_api_key(
        self, connection_id: str, api_key: str, updated_at: datetime
    ) -> ModelConnection | None: ...

    def clear_api_key(
        self, connection_id: str, updated_at: datetime
    ) -> ModelConnection | None: ...
