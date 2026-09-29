from collections.abc import Callable
from datetime import UTC, datetime

from kunyu.application.connection_locks import ConnectionOperationLocks
from kunyu.application.model_connections import (
    ModelConnectionBusyError,
    ModelConnectionNotFoundError,
)
from kunyu.application.run_lifecycle import RunLifecycleService
from kunyu.domain.model_connections import (
    ManagementStatus,
    ModelAuthMode,
    ModelConnection,
    ModelConnectionRepository,
    ModelCredentialRepository,
)

MAX_API_KEY_LENGTH = 8_192


class InvalidCredentialError(ValueError):
    pass


class UnsupportedCredentialError(ValueError):
    pass


class ModelCredentialService:
    def __init__(
        self,
        connection_repository: ModelConnectionRepository,
        credential_repository: ModelCredentialRepository,
        locks: ConnectionOperationLocks,
        run_lifecycle: RunLifecycleService,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._connections = connection_repository
        self._credentials = credential_repository
        self._locks = locks
        self._run_lifecycle = run_lifecycle
        self._clock = clock or _utc_now

    def set_api_key(self, connection_id: str, api_key: str) -> ModelConnection:
        if not api_key or not api_key.strip():
            raise InvalidCredentialError("API key must not be empty.")
        if len(api_key) > MAX_API_KEY_LENGTH:
            raise InvalidCredentialError(
                f"API key must not exceed {MAX_API_KEY_LENGTH} characters."
            )
        with self._locks.hold(connection_id):
            connection = self._get(connection_id)
            self._run_lifecycle.require_connection_available(connection_id)
            if connection.auth_mode is not ModelAuthMode.API_KEY:
                raise UnsupportedCredentialError(
                    "This connection does not use API key authentication."
                )
            _require_ready(connection)
            updated = self._credentials.set_api_key(
                connection_id,
                api_key,
                self._clock(),
            )
            if updated is None:
                raise ModelConnectionNotFoundError(connection_id)
            return updated

    def clear(self, connection_id: str) -> ModelConnection:
        with self._locks.hold(connection_id):
            connection = self._get(connection_id)
            self._run_lifecycle.require_connection_available(connection_id)
            _require_ready(connection)
            updated = self._credentials.clear_api_key(
                connection_id,
                self._clock(),
            )
            if updated is None:
                raise ModelConnectionNotFoundError(connection_id)
            return updated

    def _get(self, connection_id: str) -> ModelConnection:
        connection = self._connections.get(connection_id)
        if connection is None:
            raise ModelConnectionNotFoundError(connection_id)
        return connection


def _require_ready(connection: ModelConnection) -> None:
    if connection.management_status is not ManagementStatus.READY:
        raise ModelConnectionBusyError(
            "The model connection has an unfinished management operation."
        )


def _utc_now() -> datetime:
    return datetime.now(UTC)
