from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import UTC, datetime

from kunyu.application.connection_locks import ConnectionOperationLocks
from kunyu.application.model_catalog_rules import (
    apply_protocol_reasoning,
    find_entry,
    merge_discovery,
    new_catalog_entry,
    ordered_sources,
    require_testable_entry,
    unchecked,
)
from kunyu.application.model_connections import (
    InvalidModelConnectionError,
    ModelConnectionNotFoundError,
    normalize_model_id,
)
from kunyu.application.run_lifecycle import RunLifecycleService
from kunyu.domain.model_connections import (
    CapabilitySource,
    CapabilityStatus,
    CatalogAvailability,
    CatalogSource,
    CheckStatus,
    CredentialStatus,
    DiscoveryState,
    DiscoveryStatus,
    ModelAuthMode,
    ModelCatalogEntry,
    ModelCheck,
    ModelConnection,
    ModelConnectionRepository,
    ModelCredentialRepository,
)
from kunyu.domain.model_reasoning import (
    reasoning_parameters,
    require_reasoning_protocol,
)
from kunyu.domain.model_settings import ModelSettings
from kunyu.integrations.model.provider_client import (
    ModelCheckOutcome,
    ModelProviderClient,
    ProviderConfig,
    ProviderRequestError,
)


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


class ModelCatalogService:
    def __init__(
        self,
        connection_repository: ModelConnectionRepository,
        credential_repository: ModelCredentialRepository,
        locks: ConnectionOperationLocks,
        provider: ModelProviderClient,
        run_lifecycle: RunLifecycleService,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._connections = connection_repository
        self._credentials = credential_repository
        self._locks = locks
        self._provider = provider
        self._run_lifecycle = run_lifecycle
        self._clock = clock or _utc_now

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

    def add_manual_model(self, connection_id: str, model_id: str) -> ModelCatalogEntry:
        normalized_id = normalize_model_id(model_id)
        with self._locks.hold(connection_id):
            self._run_lifecycle.require_connection_available(connection_id)
            connection = self._get(connection_id)
            current = find_entry(connection, normalized_id)
            if current is not None and CatalogSource.MANUAL in current.sources:
                raise ManualModelExistsError(
                    f"Manual model '{normalized_id}' already exists."
                )
            now = self._clock()
            if current is None:
                entry = new_catalog_entry(
                    normalized_id,
                    None,
                    (CatalogSource.MANUAL,),
                    connection.revision,
                    now,
                )
                catalog = (*connection.catalog, entry)
            else:
                reset_checks = (
                    current.revision != connection.revision
                    or current.availability is CatalogAvailability.UNAVAILABLE
                )
                entry = replace(
                    current,
                    sources=(
                        (CatalogSource.MANUAL,)
                        if reset_checks
                        else ordered_sources((*current.sources, CatalogSource.MANUAL))
                    ),
                    revision=connection.revision,
                    availability=CatalogAvailability.AVAILABLE,
                    text_check=unchecked() if reset_checks else current.text_check,
                    tool_check=unchecked() if reset_checks else current.tool_check,
                    tool_capability=(
                        CapabilityStatus.UNKNOWN
                        if reset_checks
                        and current.tool_capability_source
                        is CapabilitySource.VALIDATION
                        else current.tool_capability
                    ),
                    tool_capability_source=(
                        CapabilitySource.UNKNOWN
                        if reset_checks
                        and current.tool_capability_source
                        is CapabilitySource.VALIDATION
                        else current.tool_capability_source
                    ),
                )
                catalog = tuple(
                    entry if item.model_id == normalized_id else item
                    for item in connection.catalog
                )
            updated = self._connections.update(
                replace(
                    connection,
                    catalog=tuple(
                        apply_protocol_reasoning(connection, entry) for entry in catalog
                    ),
                    check_generation=connection.check_generation + 1,
                    updated_at=now,
                )
            )
            result = find_entry(updated, normalized_id)
            if result is None:
                raise RuntimeError("The manual model disappeared during update.")
            return result

    def set_model_settings(
        self, connection_id: str, model_id: str, settings: ModelSettings
    ) -> ModelCatalogEntry:
        normalized_id = normalize_model_id(model_id)
        with self._locks.hold(connection_id):
            self._run_lifecycle.require_connection_available(connection_id)
            connection = self._get(connection_id)
            current = require_testable_entry(connection, normalized_id)
            try:
                require_reasoning_protocol(
                    connection.protocol, settings.reasoning_settings
                )
            except ValueError as error:
                raise InvalidModelConnectionError(str(error)) from error
            changed_request = (
                current.max_output_tokens != settings.max_output_tokens
                or current.reasoning_settings != settings.reasoning_settings
                or current.context_window != settings.context_window
                or current.retention_tokens != settings.retention_tokens
            )
            entry = replace(
                current,
                image_input=settings.image_input,
                reasoning_settings=settings.reasoning_settings,
                max_output_tokens=settings.max_output_tokens,
                context_window=settings.context_window,
                retention_tokens=settings.retention_tokens,
                text_check=unchecked() if changed_request else current.text_check,
                tool_check=unchecked() if changed_request else current.tool_check,
                tool_capability=CapabilityStatus.UNKNOWN
                if changed_request
                and current.tool_capability_source is CapabilitySource.VALIDATION
                else current.tool_capability,
                tool_capability_source=CapabilitySource.UNKNOWN
                if changed_request
                and current.tool_capability_source is CapabilitySource.VALIDATION
                else current.tool_capability_source,
            )
            updated = self._connections.update(
                replace(
                    connection,
                    catalog=tuple(
                        entry if item.model_id == normalized_id else item
                        for item in connection.catalog
                    ),
                    check_generation=connection.check_generation + int(changed_request),
                    updated_at=self._clock(),
                )
            )
            result = find_entry(updated, normalized_id)
            if result is None:
                raise RuntimeError("The model disappeared during its settings update.")
            return result

    def delete_manual_model(self, connection_id: str, model_id: str) -> None:
        normalized_id = normalize_model_id(model_id)
        with self._locks.hold(connection_id):
            self._run_lifecycle.require_connection_available(connection_id)
            connection = self._get(connection_id)
            current = find_entry(connection, normalized_id)
            if current is None or CatalogSource.MANUAL not in current.sources:
                raise ManualModelNotFoundError(normalized_id)
            if CatalogSource.FETCHED in current.sources:
                catalog = tuple(
                    replace(
                        item,
                        sources=tuple(
                            source
                            for source in item.sources
                            if source is not CatalogSource.MANUAL
                        ),
                    )
                    if item.model_id == normalized_id
                    else item
                    for item in connection.catalog
                )
                enabled_model_ids = connection.enabled_model_ids
                default_model_id = connection.default_model_id
            else:
                catalog = tuple(
                    item
                    for item in connection.catalog
                    if item.model_id != normalized_id
                )
                enabled_model_ids = tuple(
                    item
                    for item in connection.enabled_model_ids
                    if item != normalized_id
                )
                default_model_id = (
                    None
                    if connection.default_model_id == normalized_id
                    else connection.default_model_id
                )
            self._connections.update(
                replace(
                    connection,
                    catalog=catalog,
                    enabled_model_ids=enabled_model_ids,
                    default_model_id=default_model_id,
                    check_generation=connection.check_generation + 1,
                    updated_at=self._clock(),
                )
            )

    async def test_model(
        self,
        connection_id: str,
        model_id: str,
        mode: str,
    ) -> ModelTestResult:
        if mode not in {"text", "tools"}:
            raise InvalidModelConnectionError("Unsupported model check mode.")
        normalized_id = normalize_model_id(model_id)
        with self._locks.hold(connection_id):
            connection = self._get(connection_id)
            entry = require_testable_entry(connection, normalized_id)
            provider = self._provider_config(connection)
            generation = connection.check_generation + 1
            revision = connection.revision
            self._connections.update(
                replace(
                    connection,
                    check_generation=generation,
                    updated_at=self._clock(),
                )
            )

        parameters = reasoning_parameters(
            connection.protocol,
            connection.provider_type,
            entry.default_reasoning_effort,
            entry.reasoning_settings,
        )
        outcome = (
            await self._provider.check_text(
                provider, entry.model_id, entry.max_output_tokens, parameters
            )
            if mode == "text"
            else await self._provider.check_tools(
                provider, entry.model_id, entry.max_output_tokens, parameters
            )
        )
        return self._commit_check(
            connection_id,
            revision,
            generation,
            entry.model_id,
            mode,
            outcome,
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

    def _commit_check(
        self,
        connection_id: str,
        revision: int,
        generation: int,
        model_id: str,
        mode: str,
        outcome: ModelCheckOutcome,
    ) -> ModelTestResult:
        with self._locks.hold(connection_id):
            connection = self._get(connection_id)
            if (
                connection.revision != revision
                or connection.check_generation != generation
            ):
                raise CheckSupersededError("The model check was superseded.")
            entry = require_testable_entry(connection, model_id)
            checked_at = self._clock()
            error_code = (
                outcome.error_code.value if outcome.error_code is not None else None
            )
            text_check = ModelCheck(
                status=(
                    CheckStatus.PASSED if outcome.text_passed else CheckStatus.FAILED
                ),
                checked_at=checked_at,
                error_code=None if outcome.text_passed else error_code,
            )
            tool_check = entry.tool_check
            tool_capability = entry.tool_capability
            tool_capability_source = entry.tool_capability_source
            if mode == "tools":
                if outcome.tool_passed is None:
                    tool_check = unchecked()
                else:
                    tool_check = ModelCheck(
                        status=(
                            CheckStatus.PASSED
                            if outcome.tool_passed
                            else CheckStatus.FAILED
                        ),
                        checked_at=checked_at,
                        error_code=None if outcome.tool_passed else error_code,
                    )
                    if outcome.tool_passed:
                        tool_capability = CapabilityStatus.SUPPORTED
                        tool_capability_source = CapabilitySource.VALIDATION
                if (
                    outcome.tool_passed is not True
                    and tool_capability_source is CapabilitySource.VALIDATION
                ):
                    tool_capability = CapabilityStatus.UNKNOWN
                    tool_capability_source = CapabilitySource.UNKNOWN
            updated_entry = replace(
                entry,
                text_check=text_check,
                tool_check=tool_check,
                tool_capability=tool_capability,
                tool_capability_source=tool_capability_source,
            )
            catalog = tuple(
                updated_entry if item.model_id == model_id else item
                for item in connection.catalog
            )
            updated = self._connections.update(
                replace(connection, catalog=catalog, updated_at=checked_at)
            )
            selected_check = (
                updated_entry.text_check if mode == "text" else updated_entry.tool_check
            )
            return ModelTestResult(
                connection=updated,
                model_id=model_id,
                revision=revision,
                status=selected_check.status,
                latency_ms=outcome.latency_ms,
                error_code=selected_check.error_code,
            )

    def _provider_config(self, connection: ModelConnection) -> ProviderConfig:
        if connection.credential.status is not CredentialStatus.READY:
            raise InvalidModelConnectionError(
                "The model connection credential is not configured."
            )
        api_key = self._credentials.get_api_key(connection.id)
        if connection.auth_mode is ModelAuthMode.API_KEY and api_key is None:
            raise InvalidModelConnectionError(
                "The model connection credential is not configured."
            )
        return ProviderConfig(
            protocol=connection.protocol,
            provider_type=connection.provider_type,
            base_url=connection.base_url,
            auth_mode=connection.auth_mode,
            api_key=api_key,
            max_tokens_field=connection.max_tokens_field,
        )

    def _get(self, connection_id: str) -> ModelConnection:
        connection = self._connections.get(connection_id)
        if connection is None:
            raise ModelConnectionNotFoundError(connection_id)
        return connection


def _require_current_discovery(
    connection: ModelConnection, snapshot: DiscoverySnapshot
) -> None:
    if (
        connection.revision != snapshot.revision
        or connection.discovery.generation != snapshot.generation
        or connection.discovery.status is not DiscoveryStatus.PENDING
    ):
        raise DiscoverySupersededError("The model discovery operation was superseded.")


def _utc_now() -> datetime:
    return datetime.now(UTC)
