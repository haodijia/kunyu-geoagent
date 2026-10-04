from datetime import datetime
from typing import Annotated, Literal, Self

from fastapi import APIRouter, Depends, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field

from kunyu.agent.runtime.retry_policy import NormalRetryPolicy, RetryPolicy
from kunyu.api.dependencies import (
    get_connection_operation_locks,
    get_database,
    get_run_lifecycle_service,
)
from kunyu.api.errors import ApiError
from kunyu.application.connection_locks import ConnectionOperationLocks
from kunyu.application.credentials import (
    InvalidCredentialError,
    ModelCredentialService,
    UnsupportedCredentialError,
)
from kunyu.application.model_catalog import (
    CheckSupersededError,
    DiscoveryResult,
    DiscoverySupersededError,
    ManualModelExistsError,
    ManualModelNotFoundError,
    ModelCatalogService,
    ModelTestResult,
)
from kunyu.application.model_connections import (
    DefaultModelConnectionError,
    InvalidModelConnectionError,
    ModelConnectionBusyError,
    ModelConnectionNotFoundError,
    ModelConnectionService,
)
from kunyu.application.model_discovery_tasks import ModelDiscoveryTasks
from kunyu.application.run_lifecycle import (
    ModelConnectionInUseError,
    RunLifecycleService,
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
    ModelProviderType,
)
from kunyu.domain.model_images import ModelImageInput
from kunyu.integrations.model.provider_client import (
    ProviderErrorCode,
    ProviderRequestError,
)
from kunyu.persistence.database import Database
from kunyu.persistence.model_connections import SQLAlchemyModelConnectionRepository

router = APIRouter(prefix="/api/v1/model-connections", tags=["model-connections"])


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
    reasoning_efforts: list[str]
    reasoning_default: str | None
    image_input: ModelImageInput
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
            reasoning_default=entry.reasoning_default,
            image_input=entry.image_input,
            reasoning_source=entry.reasoning_source,
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


def get_model_connection_service(
    database: Annotated[Database, Depends(get_database)],
    locks: Annotated[ConnectionOperationLocks, Depends(get_connection_operation_locks)],
    run_lifecycle: Annotated[RunLifecycleService, Depends(get_run_lifecycle_service)],
) -> ModelConnectionService:
    return ModelConnectionService(
        SQLAlchemyModelConnectionRepository(database),
        locks,
        run_lifecycle,
    )


ModelConnectionServiceDependency = Annotated[
    ModelConnectionService, Depends(get_model_connection_service)
]


def get_model_credential_service(
    database: Annotated[Database, Depends(get_database)],
    locks: Annotated[ConnectionOperationLocks, Depends(get_connection_operation_locks)],
    run_lifecycle: Annotated[RunLifecycleService, Depends(get_run_lifecycle_service)],
) -> ModelCredentialService:
    repository = SQLAlchemyModelConnectionRepository(database)
    return ModelCredentialService(
        repository,
        repository,
        locks,
        run_lifecycle,
    )


ModelCredentialServiceDependency = Annotated[
    ModelCredentialService, Depends(get_model_credential_service)
]


def get_model_discovery_tasks(request: Request) -> ModelDiscoveryTasks:
    return request.app.state.model_discovery_tasks


def get_model_catalog_service(request: Request) -> ModelCatalogService:
    return request.app.state.model_catalog_service


ModelDiscoveryTasksDependency = Annotated[
    ModelDiscoveryTasks, Depends(get_model_discovery_tasks)
]
ModelCatalogServiceDependency = Annotated[
    ModelCatalogService, Depends(get_model_catalog_service)
]


@router.post(
    "",
    response_model=ModelConnectionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_model_connection(
    request: CreateModelConnectionRequest,
    service: ModelConnectionServiceDependency,
    discovery_tasks: ModelDiscoveryTasksDependency,
) -> ModelConnectionResponse:
    try:
        connection = service.create(
            display_name=request.display_name,
            provider_type=request.provider_type,
            protocol=ModelProtocol(request.protocol),
            base_url=request.base_url,
            auth_mode=request.auth_mode,
            max_tokens_field=request.max_tokens_field,
            include_usage=request.include_usage,
            retry_policy=request.retry_policy,
        )
    except InvalidModelConnectionError as error:
        raise _invalid_input(error) from error
    discovery_tasks.schedule_if_pending(connection)
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
async def update_model_connection(
    connection_id: str,
    request: UpdateModelConnectionRequest,
    service: ModelConnectionServiceDependency,
    discovery_tasks: ModelDiscoveryTasksDependency,
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
    except ModelConnectionBusyError as error:
        raise _connection_busy(error) from error
    except ModelConnectionInUseError as error:
        raise _connection_in_use(error) from error
    except InvalidModelConnectionError as error:
        raise _invalid_input(error) from error
    discovery_tasks.schedule_if_pending(connection)
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
    except ModelConnectionBusyError as error:
        raise _connection_busy(error) from error
    except ModelConnectionInUseError as error:
        raise _connection_in_use(error) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{connection_id}/credential", response_model=ModelConnectionResponse)
async def set_model_connection_credential(
    connection_id: str,
    request: SetCredentialRequest,
    service: ModelCredentialServiceDependency,
    discovery_tasks: ModelDiscoveryTasksDependency,
) -> ModelConnectionResponse:
    try:
        connection = service.set_api_key(connection_id, request.api_key)
    except ModelConnectionNotFoundError as error:
        raise _not_found(error) from error
    except InvalidCredentialError as error:
        raise _invalid_input(error) from error
    except UnsupportedCredentialError as error:
        raise ApiError(422, "UNSUPPORTED_CAPABILITY", str(error)) from error
    except ModelConnectionBusyError as error:
        raise _connection_busy(error) from error
    except ModelConnectionInUseError as error:
        raise _connection_in_use(error) from error
    discovery_tasks.schedule_if_pending(connection)
    return ModelConnectionResponse.from_domain(connection)


@router.delete("/{connection_id}/credential", response_model=ModelConnectionResponse)
def clear_model_connection_credential(
    connection_id: str,
    service: ModelCredentialServiceDependency,
) -> ModelConnectionResponse:
    try:
        connection = service.clear(connection_id)
    except ModelConnectionNotFoundError as error:
        raise _not_found(error) from error
    except ModelConnectionBusyError as error:
        raise _connection_busy(error) from error
    except ModelConnectionInUseError as error:
        raise _connection_in_use(error) from error
    return ModelConnectionResponse.from_domain(connection)


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
    except ModelConnectionBusyError as error:
        raise _connection_busy(error) from error
    except ModelConnectionInUseError as error:
        raise _connection_in_use(error) from error
    except InvalidModelConnectionError as error:
        raise _invalid_input(error) from error
    return ModelConnectionResponse.from_domain(connection)


@router.post(
    "/{connection_id}/discover-models",
    response_model=ModelDiscoveryResponse,
)
async def discover_connection_models(
    connection_id: str,
    _: EmptyRequest,
    service: ModelCatalogServiceDependency,
) -> ModelDiscoveryResponse:
    try:
        result = await service.discover(connection_id)
    except ModelConnectionNotFoundError as error:
        raise _not_found(error) from error
    except InvalidModelConnectionError as error:
        raise _invalid_input(error) from error
    except DiscoverySupersededError as error:
        raise ApiError(409, "DISCOVERY_SUPERSEDED", str(error)) from error
    except ProviderRequestError as error:
        raise _provider_error(error) from error
    return ModelDiscoveryResponse.from_result(result)


@router.post(
    "/{connection_id}/manual-models",
    response_model=ModelCatalogEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_manual_model(
    connection_id: str,
    request: ManualModelRequest,
    service: ModelCatalogServiceDependency,
) -> ModelCatalogEntryResponse:
    try:
        entry = service.add_manual_model(connection_id, request.model_id)
    except ModelConnectionNotFoundError as error:
        raise _not_found(error) from error
    except InvalidModelConnectionError as error:
        raise _invalid_input(error) from error
    except ManualModelExistsError as error:
        raise ApiError(409, "MODEL_EXISTS", str(error)) from error
    except ModelConnectionInUseError as error:
        raise _connection_in_use(error) from error
    return ModelCatalogEntryResponse.from_domain(entry)


@router.put("/{connection_id}/image-input", response_model=ModelCatalogEntryResponse)
def set_model_image_input(
    connection_id: str,
    request: ModelImageInput,
    service: ModelCatalogServiceDependency,
    model_id: Annotated[str, Query(min_length=1, max_length=256)],
) -> ModelCatalogEntryResponse:
    try:
        entry = service.set_image_input(connection_id, model_id, request)
    except ModelConnectionNotFoundError as error:
        raise _not_found(error) from error
    except InvalidModelConnectionError as error:
        raise _invalid_input(error) from error
    except ModelConnectionInUseError as error:
        raise _connection_in_use(error) from error
    return ModelCatalogEntryResponse.from_domain(entry)


@router.delete(
    "/{connection_id}/manual-models",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_manual_model(
    connection_id: str,
    service: ModelCatalogServiceDependency,
    model_id: Annotated[str, Query(min_length=1, max_length=256)],
) -> Response:
    try:
        service.delete_manual_model(connection_id, model_id)
    except ModelConnectionNotFoundError as error:
        raise _not_found(error) from error
    except InvalidModelConnectionError as error:
        raise _invalid_input(error) from error
    except ManualModelNotFoundError as error:
        raise ApiError(
            404,
            "NOT_FOUND",
            "The manual model was not found.",
            {"model_id": error.model_id},
        ) from error
    except ModelConnectionInUseError as error:
        raise _connection_in_use(error) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{connection_id}/test", response_model=ModelTestResponse)
async def test_model_connection(
    connection_id: str,
    request: ModelTestRequest,
    service: ModelCatalogServiceDependency,
) -> ModelTestResponse:
    try:
        result = await service.test_model(
            connection_id,
            request.model_id,
            request.mode,
        )
    except ModelConnectionNotFoundError as error:
        raise _not_found(error) from error
    except InvalidModelConnectionError as error:
        raise _invalid_input(error) from error
    except CheckSupersededError as error:
        raise ApiError(409, "CHECK_SUPERSEDED", str(error)) from error
    return ModelTestResponse.from_result(result)


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


def _connection_busy(error: Exception) -> ApiError:
    return ApiError(409, "CONNECTION_BUSY", str(error))


def _connection_in_use(error: ModelConnectionInUseError) -> ApiError:
    return ApiError(
        409,
        "CONNECTION_IN_USE",
        str(error),
        {"connection_id": error.connection_id},
    )


def _provider_error(error: ProviderRequestError) -> ApiError:
    status_code = 504 if error.code is ProviderErrorCode.TIMEOUT else 502
    return ApiError(status_code, error.code.value, str(error))
