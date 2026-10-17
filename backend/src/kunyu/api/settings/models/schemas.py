"""Model connection HTTP schemas."""

from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field

from kunyu.agent.runtime.contracts.retry_policy import NormalRetryPolicy, RetryPolicy
from kunyu.application.models.catalog.contracts import DiscoveryResult, ModelTestResult
from kunyu.domain.models.model_connections import (
    CapabilitySource,
    CapabilityStatus,
    CatalogAvailability,
    CatalogSource,
    CheckStatus,
    CredentialStatus,
    DiscoveryStatus,
    ManagementStatus,
    MaxTokensField,
    ModelAuthMode,
    ModelCatalogEntry,
    ModelCheck,
    ModelConnection,
    ModelProtocol,
    ModelProviderType,
)
from kunyu.domain.models.model_images import ModelImageInput
from kunyu.domain.models.model_reasoning import ModelReasoningSettings


class CreateModelConnectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    display_name: str = Field(min_length=1, max_length=200)
    provider_type: ModelProviderType
    protocol: ModelProtocol
    base_url: str = Field(min_length=1, max_length=2_048)
    auth_mode: ModelAuthMode
    max_tokens_field: MaxTokensField
    include_usage: bool
    retry_policy: RetryPolicy = NormalRetryPolicy()


class UpdateModelConnectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    protocol: ModelProtocol | None = None
    base_url: str | None = Field(default=None, min_length=1, max_length=2_048)
    auth_mode: ModelAuthMode | None = None
    enabled: bool | None = None
    enabled_model_ids: list[str] | None = None
    default_model_id: str | None = Field(default=None, max_length=256)
    max_tokens_field: MaxTokensField | None = None
    include_usage: bool | None = None
    retry_policy: RetryPolicy | None = None
    is_default: Literal[False] | None = None


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SetCredentialRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    api_key: str = Field(min_length=1, max_length=8_192)


class ManualModelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    model_id: str = Field(min_length=1, max_length=256)


class ModelTestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    model_id: str = Field(min_length=1, max_length=256)
    mode: Literal["text", "tools"]


class CredentialResponse(BaseModel):
    status: CredentialStatus
    configured: bool
    updated_at: datetime | None


class DiscoveryResponse(BaseModel):
    status: DiscoveryStatus
    generation: int
    last_success_at: datetime | None
    error_code: str | None


class ModelCheckResponse(BaseModel):
    status: CheckStatus
    checked_at: datetime | None
    error_code: str | None

    @classmethod
    def from_domain(cls, check: ModelCheck) -> Self:
        return cls(
            status=check.status,
            checked_at=check.checked_at,
            error_code=check.error_code,
        )


class ModelCatalogEntryResponse(BaseModel):
    model_id: str
    display_name: str | None
    sources: list[CatalogSource]
    revision: int
    availability: CatalogAvailability
    enabled: bool
    checks: dict[Literal["text", "tools"], ModelCheckResponse]
    tool_capability: CapabilityStatus
    tool_capability_source: CapabilitySource
    reasoning_settings: ModelReasoningSettings | None
    reasoning_efforts: list[str]
    reasoning_default: str | None
    image_input: ModelImageInput
    context_window: int | None
    retention_tokens: int
    max_output_tokens: int
    reasoning_source: CapabilitySource
    discovered_at: datetime | None

    @classmethod
    def from_domain(cls, entry: ModelCatalogEntry) -> Self:
        return cls(
            model_id=entry.model_id,
            display_name=entry.display_name,
            sources=list(entry.sources),
            revision=entry.revision,
            availability=entry.availability,
            enabled=entry.enabled,
            checks={
                "text": ModelCheckResponse.from_domain(entry.text_check),
                "tools": ModelCheckResponse.from_domain(entry.tool_check),
            },
            tool_capability=entry.tool_capability,
            tool_capability_source=entry.tool_capability_source,
            reasoning_settings=entry.reasoning_settings,
            reasoning_efforts=list(entry.available_reasoning_efforts),
            reasoning_default=entry.default_reasoning_effort,
            image_input=entry.image_input,
            max_output_tokens=entry.max_output_tokens,
            context_window=entry.context_window,
            retention_tokens=entry.retention_tokens,
            reasoning_source=entry.effective_reasoning_source,
            discovered_at=entry.discovered_at,
        )


class ModelConnectionResponse(BaseModel):
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
    enabled_model_ids: list[str]
    max_tokens_field: MaxTokensField
    include_usage: bool
    retry_policy: RetryPolicy
    credential: CredentialResponse
    management_status: ManagementStatus
    discovery: DiscoveryResponse
    entries: list[ModelCatalogEntryResponse]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, connection: ModelConnection) -> Self:
        return cls(
            id=connection.id,
            display_name=connection.display_name,
            provider_type=connection.provider_type,
            protocol=connection.protocol,
            base_url=connection.base_url,
            auth_mode=connection.auth_mode,
            enabled=connection.enabled,
            is_default=connection.is_default,
            revision=connection.revision,
            default_model_id=connection.default_model_id,
            enabled_model_ids=list(connection.enabled_model_ids),
            max_tokens_field=connection.max_tokens_field,
            include_usage=connection.include_usage,
            retry_policy=connection.retry_policy,
            credential=CredentialResponse(
                status=connection.credential.status,
                configured=connection.credential.configured,
                updated_at=connection.credential.updated_at,
            ),
            management_status=connection.management_status,
            discovery=DiscoveryResponse(
                status=connection.discovery.status,
                generation=connection.discovery.generation,
                last_success_at=connection.discovery.last_success_at,
                error_code=connection.discovery.error_code,
            ),
            entries=[
                ModelCatalogEntryResponse.from_domain(entry)
                for entry in connection.catalog
            ],
            created_at=connection.created_at,
            updated_at=connection.updated_at,
        )


class ModelDiscoveryResponse(BaseModel):
    revision: int
    generation: int
    entries: list[ModelCatalogEntryResponse]
    discovered_at: datetime

    @classmethod
    def from_result(cls, result: DiscoveryResult) -> Self:
        return cls(
            revision=result.connection.revision,
            generation=result.generation,
            entries=[
                ModelCatalogEntryResponse.from_domain(entry)
                for entry in result.connection.catalog
            ],
            discovered_at=result.discovered_at,
        )


class ModelTestResponse(BaseModel):
    model_id: str
    revision: int
    status: CheckStatus
    checks: dict[Literal["text", "tools"], ModelCheckResponse]
    latency_ms: int
    error_code: str | None

    @classmethod
    def from_result(cls, result: ModelTestResult) -> Self:
        entry = next(
            item
            for item in result.connection.catalog
            if item.model_id == result.model_id
        )
        return cls(
            model_id=result.model_id,
            revision=result.revision,
            status=result.status,
            checks={
                "text": ModelCheckResponse.from_domain(entry.text_check),
                "tools": ModelCheckResponse.from_domain(entry.tool_check),
            },
            latency_ms=result.latency_ms,
            error_code=result.error_code,
        )
