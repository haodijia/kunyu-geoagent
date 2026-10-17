"""Model connection HTTP errors."""

from kunyu.api.errors import ApiError
from kunyu.application.execution.run_lifecycle import ModelConnectionInUseError
from kunyu.application.models.model_connections import (
    ModelConnectionNotFoundError,
    ModelConnectionService,
)
from kunyu.domain.models.model_connections import ModelConnection
from kunyu.integrations.model.provider_client import (
    ProviderErrorCode,
    ProviderRequestError,
)


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
