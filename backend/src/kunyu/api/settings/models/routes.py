"""Model connection HTTP routes."""

from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from kunyu.api.errors import ApiError
from kunyu.api.settings.models.dependencies import (
    ModelCatalogServiceDependency,
    ModelConnectionServiceDependency,
    ModelCredentialServiceDependency,
    ModelDiscoveryTasksDependency,
)
from kunyu.api.settings.models.errors import (
    _connection_busy,
    _connection_in_use,
    _default_connection,
    _get,
    _invalid_input,
    _not_found,
    _provider_error,
)
from kunyu.api.settings.models.schemas import (
    CreateModelConnectionRequest,
    EmptyRequest,
    ManualModelRequest,
    ModelCatalogEntryResponse,
    ModelConnectionResponse,
    ModelDiscoveryResponse,
    ModelTestRequest,
    ModelTestResponse,
    SetCredentialRequest,
    UpdateModelConnectionRequest,
)
from kunyu.application.execution.run_lifecycle import ModelConnectionInUseError
from kunyu.application.models.catalog.contracts import (
    CheckSupersededError,
    DiscoverySupersededError,
    ManualModelExistsError,
    ManualModelNotFoundError,
)
from kunyu.application.models.credentials import (
    InvalidCredentialError,
    UnsupportedCredentialError,
)
from kunyu.application.models.model_connections import (
    DefaultModelConnectionError,
    InvalidModelConnectionError,
    ModelConnectionBusyError,
    ModelConnectionNotFoundError,
)
from kunyu.domain.models.model_connections import ModelProtocol
from kunyu.domain.models.model_settings import ModelSettings
from kunyu.integrations.model.provider_client import ProviderRequestError

router = APIRouter(prefix="/api/v1/model-connections", tags=["model-connections"])


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


@router.put("/{connection_id}/model-settings", response_model=ModelCatalogEntryResponse)
def set_model_settings(
    connection_id: str,
    request: ModelSettings,
    service: ModelCatalogServiceDependency,
    model_id: Annotated[str, Query(min_length=1, max_length=256)],
) -> ModelCatalogEntryResponse:
    try:
        entry = service.set_model_settings(connection_id, model_id, request)
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


@router.get("/{connection_id}", response_model=ModelConnectionResponse)
def get_model_connection(
    connection_id: str,
    service: ModelConnectionServiceDependency,
) -> ModelConnectionResponse:
    return ModelConnectionResponse.from_domain(_get(service, connection_id))
