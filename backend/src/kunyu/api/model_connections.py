from datetime import datetime
from typing import Annotated, Literal, Self

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict, Field

from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.application.model_connections import (
    DefaultModelConnectionError,
    InvalidModelConnectionError,
    ModelConnectionNotFoundError,
    ModelConnectionService,
)
from kunyu.domain.model_connections import (
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
)
from kunyu.persistence.database import Database
from kunyu.persistence.model_connections import SQLAlchemyModelConnectionRepository

router = APIRouter(prefix="/api/v1/model-connections", tags=["model-connections"])


class CreateModelConnectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    display_name: str = Field(min_length=1, max_length=200)
    protocol: Literal[ModelProtocol.OPENAI_COMPATIBLE]
    base_url: str = Field(min_length=1, max_length=2_048)
    auth_mode: ModelAuthMode
    max_tokens_field: MaxTokensField
    include_usage: bool


class UpdateModelConnectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    base_url: str | None = Field(default=None, min_length=1, max_length=2_048)
    auth_mode: ModelAuthMode | None = None
    enabled: bool | None = None
    enabled_model_ids: list[str] | None = None
    default_model_id: str | None = Field(default=None, max_length=256)
    max_tokens_field: MaxTokensField | None = None
    include_usage: bool | None = None
    is_default: Literal[False] | None = None


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CredentialResponse(BaseModel):
    status: CredentialStatus
    configured: bool | None
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
    reasoning_efforts: list[str]
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
            reasoning_efforts=list(entry.reasoning_efforts),
            reasoning_source=entry.reasoning_source,
            discovered_at=entry.discovered_at,
        )


class ModelConnectionResponse(BaseModel):
    id: str
    display_name: str
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


def get_model_connection_service(
    database: Annotated[Database, Depends(get_database)],
) -> ModelConnectionService:
    return ModelConnectionService(SQLAlchemyModelConnectionRepository(database))


ModelConnectionServiceDependency = Annotated[
    ModelConnectionService, Depends(get_model_connection_service)
]


@router.post(
    "",
    response_model=ModelConnectionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_model_connection(
    request: CreateModelConnectionRequest,
    service: ModelConnectionServiceDependency,
) -> ModelConnectionResponse:
    try:
        connection = service.create(
            display_name=request.display_name,
            protocol=ModelProtocol(request.protocol),
            base_url=request.base_url,
            auth_mode=request.auth_mode,
            max_tokens_field=request.max_tokens_field,
            include_usage=request.include_usage,
        )
    except InvalidModelConnectionError as error:
        raise _invalid_input(error) from error
    return ModelConnectionResponse.from_domain(connection)


@router.get("", response_model=list[ModelConnectionResponse])
def list_model_connections(
    service: ModelConnectionServiceDependency,
) -> list[ModelConnectionResponse]:
    return [
        ModelConnectionResponse.from_domain(connection) for connection in service.list()
    ]


@router.get("/{connection_id}", response_model=ModelConnectionResponse)
def get_model_connection(
    connection_id: str,
    service: ModelConnectionServiceDependency,
) -> ModelConnectionResponse:
    return ModelConnectionResponse.from_domain(_get(service, connection_id))


@router.patch("/{connection_id}", response_model=ModelConnectionResponse)
def update_model_connection(
    connection_id: str,
    request: UpdateModelConnectionRequest,
    service: ModelConnectionServiceDependency,
) -> ModelConnectionResponse:
    changes = {
        field: value
        for field, value in request.model_dump().items()
        if field in request.model_fields_set
    }
    try:
        connection = service.update(connection_id, changes)
    except ModelConnectionNotFoundError as error:
        raise _not_found(error) from error
    except DefaultModelConnectionError as error:
        raise _default_connection(error) from error
    except InvalidModelConnectionError as error:
        raise _invalid_input(error) from error
    return ModelConnectionResponse.from_domain(connection)


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_model_connection(
    connection_id: str,
    service: ModelConnectionServiceDependency,
) -> Response:
    try:
        service.delete(connection_id)
    except ModelConnectionNotFoundError as error:
        raise _not_found(error) from error
    except DefaultModelConnectionError as error:
        raise _default_connection(error) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{connection_id}/default", response_model=ModelConnectionResponse)
def set_default_model_connection(
    connection_id: str,
    _: EmptyRequest,
    service: ModelConnectionServiceDependency,
) -> ModelConnectionResponse:
    try:
        connection = service.set_default(connection_id)
    except ModelConnectionNotFoundError as error:
        raise _not_found(error) from error
    except InvalidModelConnectionError as error:
        raise _invalid_input(error) from error
    return ModelConnectionResponse.from_domain(connection)


def _get(service: ModelConnectionService, connection_id: str) -> ModelConnection:
    try:
        return service.get(connection_id)
    except ModelConnectionNotFoundError as error:
        raise _not_found(error) from error


def _invalid_input(error: Exception) -> ApiError:
    return ApiError(422, "INVALID_INPUT", str(error))


def _not_found(error: ModelConnectionNotFoundError) -> ApiError:
    return ApiError(
        404,
        "NOT_FOUND",
        "The model connection was not found.",
        {"connection_id": error.connection_id},
    )


def _default_connection(error: Exception) -> ApiError:
    return ApiError(409, "DEFAULT_CONNECTION", str(error))
