"""Model discovery generation, locking and provider result commits."""

from collections.abc import Callable
from dataclasses import replace
from datetime import datetime

from kunyu.application.models.catalog.contracts import (
    DiscoveryResult,
    DiscoverySnapshot,
    DiscoverySupersededError,
)
from kunyu.application.models.connection_locks import ConnectionOperationLocks
from kunyu.application.models.model_catalog_rules import (
    apply_protocol_reasoning,
    merge_discovery,
)
from kunyu.domain.models.model_connections import (
    DiscoveryState,
    DiscoveryStatus,
    ModelConnection,
    ModelConnectionRepository,
)
from kunyu.integrations.model.provider_client import (
    ModelProviderClient,
    ProviderConfig,
    ProviderRequestError,
)


def _require_current_discovery(
    connection: ModelConnection, snapshot: DiscoverySnapshot
) -> None:
    if (
        connection.revision != snapshot.revision
        or connection.discovery.generation != snapshot.generation
        or connection.discovery.status is not DiscoveryStatus.PENDING
    ):
        raise DiscoverySupersededError("The model discovery operation was superseded.")


class ModelDiscoveryService:
    """Own discovery generations and commit only the current provider response."""

    def __init__(
        self,
        connections: ModelConnectionRepository,
        locks: ConnectionOperationLocks,
        provider: ModelProviderClient,
        get_connection: Callable[[str], ModelConnection],
        provider_config: Callable[[ModelConnection], ProviderConfig],
        clock: Callable[[], datetime],
    ) -> None:
        self._connections = connections
        self._locks = locks
        self._provider = provider
        self._get = get_connection
        self._provider_config = provider_config
        self._clock = clock

    async def discover(self, connection_id: str) -> DiscoveryResult:
        snapshot = self._prepare_discovery(connection_id)
        return await self._execute_discovery(snapshot)

    async def run_pending_discovery(
        self,
        connection_id: str,
        revision: int,
        generation: int,
    ) -> DiscoveryResult:
        snapshot = self._capture_pending_discovery(
            connection_id,
            revision,
            generation,
        )
        return await self._execute_discovery(snapshot)

    def interrupt_pending(self) -> None:
        for candidate in self._connections.list():
            if candidate.discovery.status is not DiscoveryStatus.PENDING:
                continue
            with self._locks.hold(candidate.id):
                current = self._get(candidate.id)
                if current.discovery.status is not DiscoveryStatus.PENDING:
                    continue
                self._connections.update(
                    replace(
                        current,
                        discovery=replace(
                            current.discovery,
                            status=DiscoveryStatus.INTERRUPTED,
                            error_code=None,
                        ),
                        updated_at=self._clock(),
                    )
                )

    def _prepare_discovery(self, connection_id: str) -> DiscoverySnapshot:
        with self._locks.hold(connection_id):
            connection = self._get(connection_id)
            provider = self._provider_config(connection)
            generation = connection.discovery.generation + 1
            updated = self._connections.update(
                replace(
                    connection,
                    discovery=DiscoveryState(
                        status=DiscoveryStatus.PENDING,
                        generation=generation,
                        last_success_at=connection.discovery.last_success_at,
                        error_code=None,
                    ),
                    updated_at=self._clock(),
                )
            )
            return DiscoverySnapshot(
                connection_id=updated.id,
                revision=updated.revision,
                generation=generation,
                provider=provider,
            )

    def _capture_pending_discovery(
        self,
        connection_id: str,
        revision: int,
        generation: int,
    ) -> DiscoverySnapshot:
        with self._locks.hold(connection_id):
            connection = self._get(connection_id)
            if (
                connection.revision != revision
                or connection.discovery.generation != generation
                or connection.discovery.status is not DiscoveryStatus.PENDING
            ):
                raise DiscoverySupersededError(
                    "The model discovery operation was superseded."
                )
            return DiscoverySnapshot(
                connection_id=connection.id,
                revision=revision,
                generation=generation,
                provider=self._provider_config(connection),
            )

    async def _execute_discovery(self, snapshot: DiscoverySnapshot) -> DiscoveryResult:
        try:
            models = await self._provider.discover_models(snapshot.provider)
        except ProviderRequestError as error:
            self._commit_discovery_failure(snapshot, error.code.value)
            raise
        discovered_at = self._clock()
        with self._locks.hold(snapshot.connection_id):
            connection = self._get(snapshot.connection_id)
            _require_current_discovery(connection, snapshot)
            catalog = merge_discovery(connection, models, discovered_at)
            updated = self._connections.update(
                replace(
                    connection,
                    discovery=DiscoveryState(
                        status=DiscoveryStatus.SUCCEEDED,
                        generation=snapshot.generation,
                        last_success_at=discovered_at,
                        error_code=None,
                    ),
                    catalog=tuple(
                        apply_protocol_reasoning(connection, entry) for entry in catalog
                    ),
                    check_generation=connection.check_generation + 1,
                    updated_at=discovered_at,
                )
            )
        return DiscoveryResult(updated, snapshot.generation, discovered_at)

    def _commit_discovery_failure(
        self, snapshot: DiscoverySnapshot, error_code: str
    ) -> None:
        with self._locks.hold(snapshot.connection_id):
            connection = self._get(snapshot.connection_id)
            _require_current_discovery(connection, snapshot)
            self._connections.update(
                replace(
                    connection,
                    discovery=DiscoveryState(
                        status=DiscoveryStatus.FAILED,
                        generation=snapshot.generation,
                        last_success_at=connection.discovery.last_success_at,
                        error_code=error_code,
                    ),
                    updated_at=self._clock(),
                )
            )
