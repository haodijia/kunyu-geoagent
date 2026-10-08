from datetime import datetime

from sqlalchemy import delete, select, text, update

from kunyu.agent.runtime.retry_policy import RETRY_POLICY
from kunyu.domain.model_connections import (
    CapabilitySource,
    CapabilityStatus,
    CatalogAvailability,
    CatalogSource,
    CheckStatus,
    CredentialState,
    CredentialStatus,
    DiscoveryState,
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
from kunyu.domain.model_reasoning import ModelReasoningSettings
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    ModelCatalogEntryRecord,
    ModelConnectionRecord,
    ModelCredentialRecord,
)
from kunyu.persistence.time import as_utc


class SQLAlchemyModelConnectionRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def add(self, connection: ModelConnection) -> ModelConnection:
        record = _new_record(connection)
        with self._database.sessions.begin() as session:
            session.execute(text("BEGIN IMMEDIATE"))
            session.add(record)
            session.flush()
            result = _to_domain(record)
        return result

    def get(self, connection_id: str) -> ModelConnection | None:
        with self._database.sessions() as session:
            record = session.get(ModelConnectionRecord, connection_id)
            return _to_domain(record) if record is not None else None

    def list(self) -> list[ModelConnection]:
        statement = select(ModelConnectionRecord).order_by(
            ModelConnectionRecord.updated_at.desc(),
            ModelConnectionRecord.id.desc(),
        )
        with self._database.sessions() as session:
            records = session.scalars(statement).all()
            return [_to_domain(record) for record in records]

    def update(self, connection: ModelConnection) -> ModelConnection:
        with self._database.sessions.begin() as session:
            session.execute(text("BEGIN IMMEDIATE"))
            record = session.get(ModelConnectionRecord, connection.id)
            if record is None:
                raise RuntimeError(
                    f"Model connection '{connection.id}' disappeared during update."
                )
            _copy_connection(record, connection)
            _sync_catalog(record, connection.catalog)
            session.flush()
            result = _to_domain(record)
        return result

    def set_default(
        self, connection_id: str, updated_at: datetime
    ) -> ModelConnection | None:
        with self._database.sessions.begin() as session:
            session.execute(text("BEGIN IMMEDIATE"))
            record = session.get(ModelConnectionRecord, connection_id)
            if record is None:
                return None
            session.execute(
                update(ModelConnectionRecord)
                .where(ModelConnectionRecord.is_default.is_(True))
                .values(is_default=False, updated_at=updated_at)
            )
            record.is_default = True
            record.updated_at = updated_at
            session.flush()
            result = _to_domain(record)
        return result

    def get_api_key(self, connection_id: str) -> str | None:
        with self._database.sessions() as session:
            credential = session.get(ModelCredentialRecord, connection_id)
            return credential.api_key if credential is not None else None

    def set_api_key(
        self, connection_id: str, api_key: str, updated_at: datetime
    ) -> ModelConnection | None:
        with self._database.sessions.begin() as session:
            session.execute(text("BEGIN IMMEDIATE"))
            connection = session.get(ModelConnectionRecord, connection_id)
            if connection is None:
                return None
            if connection.auth_mode != ModelAuthMode.API_KEY.value:
                raise RuntimeError(
                    "Cannot store an API key for a connection without API key auth."
                )
            credential = connection.credential_record
            if credential is None:
                connection.credential_record = ModelCredentialRecord(
                    connection_id=connection_id,
                    api_key=api_key,
                    updated_at=updated_at,
                )
            else:
                credential.api_key = api_key
                credential.updated_at = updated_at
            _apply_credential_change(connection, configured=True, updated_at=updated_at)
            session.flush()
            result = _to_domain(connection)
        return result

    def clear_api_key(
        self, connection_id: str, updated_at: datetime
    ) -> ModelConnection | None:
        with self._database.sessions.begin() as session:
            session.execute(text("BEGIN IMMEDIATE"))
            connection = session.get(ModelConnectionRecord, connection_id)
            if connection is None:
                return None
            connection.credential_record = None
            _apply_credential_change(
                connection,
                configured=False,
                updated_at=updated_at,
            )
            session.flush()
            result = _to_domain(connection)
        return result

    def delete(self, connection_id: str) -> bool:
        with self._database.sessions.begin() as session:
            session.execute(text("BEGIN IMMEDIATE"))
            result = session.execute(
                delete(ModelConnectionRecord).where(
                    ModelConnectionRecord.id == connection_id,
                    ModelConnectionRecord.is_default.is_(False),
                )
            )
            return result.rowcount == 1


def _new_record(connection: ModelConnection) -> ModelConnectionRecord:
    record = ModelConnectionRecord(id=connection.id)
    _copy_connection(record, connection)
    _sync_catalog(record, connection.catalog)
    return record


def _copy_connection(
    record: ModelConnectionRecord, connection: ModelConnection
) -> None:
    record.display_name = connection.display_name
    record.provider_type = connection.provider_type.value
    record.protocol = connection.protocol.value
    record.base_url = connection.base_url
    record.auth_mode = connection.auth_mode.value
    record.enabled = connection.enabled
    record.is_default = connection.is_default
    record.revision = connection.revision
    record.default_model_id = connection.default_model_id
    record.enabled_model_ids = list(connection.enabled_model_ids)
    record.max_tokens_field = connection.max_tokens_field.value
    record.include_usage = connection.include_usage
    record.retry_policy = connection.retry_policy.model_dump(mode="json")
    record.credential_status = connection.credential.status.value
    record.credential_configured = connection.credential.configured
    record.credential_updated_at = connection.credential.updated_at
    record.management_status = connection.management_status.value
    record.discovery_status = connection.discovery.status.value
    record.discovery_generation = connection.discovery.generation
    record.discovery_last_success_at = connection.discovery.last_success_at
    record.discovery_error_code = connection.discovery.error_code
    record.check_generation = connection.check_generation
    record.created_at = connection.created_at
    record.updated_at = connection.updated_at


def _sync_catalog(
    record: ModelConnectionRecord, catalog: tuple[ModelCatalogEntry, ...]
) -> None:
    current = {item.model_id: item for item in record.catalog_entries}
    incoming_ids = {entry.model_id for entry in catalog}
    for model_id, item in current.items():
        if model_id not in incoming_ids:
            record.catalog_entries.remove(item)
    for entry in catalog:
        item = current.get(entry.model_id)
        if item is None:
            item = ModelCatalogEntryRecord(
                connection_id=record.id,
                model_id=entry.model_id,
            )
            record.catalog_entries.append(item)
        _copy_catalog_entry(item, entry)


def _copy_catalog_entry(
    record: ModelCatalogEntryRecord, entry: ModelCatalogEntry
) -> None:
    record.display_name = entry.display_name
    record.sources = [source.value for source in entry.sources]
    record.revision = entry.revision
    record.availability = entry.availability.value
    record.text_check = entry.text_check.status.value
    record.text_checked_at = entry.text_check.checked_at
    record.text_error_code = entry.text_check.error_code
    record.tool_check = entry.tool_check.status.value
    record.tool_checked_at = entry.tool_check.checked_at
    record.tool_error_code = entry.tool_check.error_code
    record.tool_capability = entry.tool_capability.value
    record.tool_capability_source = entry.tool_capability_source.value
    record.max_output_tokens = entry.max_output_tokens
    record.context_window = entry.context_window
    record.retention_tokens = entry.retention_tokens
    record.reasoning_settings = (
        entry.reasoning_settings.model_dump(mode="json")
        if entry.reasoning_settings is not None
        else None
    )
    record.reasoning_efforts = list(entry.reasoning_efforts)
    record.image_input = entry.image_input.model_dump(mode="json")
    record.reasoning_default = entry.reasoning_default
    record.reasoning_source = entry.reasoning_source.value
    record.discovered_at = entry.discovered_at


def _apply_credential_change(
    connection: ModelConnectionRecord,
    *,
    configured: bool,
    updated_at: datetime,
) -> None:
    connection.credential_status = (
        CredentialStatus.READY.value
        if configured or connection.auth_mode == ModelAuthMode.NONE.value
        else CredentialStatus.MISSING.value
    )
    connection.credential_configured = configured
    connection.credential_updated_at = updated_at
    connection.revision += 1
    connection.discovery_status = (
        DiscoveryStatus.PENDING.value if configured else DiscoveryStatus.IDLE.value
    )
    if configured:
        connection.discovery_generation += 1
    connection.discovery_last_success_at = None
    connection.discovery_error_code = None
    connection.check_generation += 1
    connection.updated_at = updated_at
    _invalidate_catalog_records(connection.catalog_entries, connection.revision)


def _invalidate_catalog_records(
    entries: list[ModelCatalogEntryRecord],
    revision: int,
) -> None:
    for entry in entries:
        is_manual = CatalogSource.MANUAL.value in entry.sources
        if is_manual:
            entry.sources = [CatalogSource.MANUAL.value]
            entry.revision = revision
        entry.availability = (
            CatalogAvailability.AVAILABLE.value
            if is_manual
            else CatalogAvailability.UNAVAILABLE.value
        )
        entry.text_check = CheckStatus.UNCHECKED.value
        entry.text_checked_at = None
        entry.text_error_code = None
        entry.tool_check = CheckStatus.UNCHECKED.value
        entry.tool_checked_at = None
        entry.tool_error_code = None
        if entry.tool_capability_source == CapabilitySource.VALIDATION.value:
            entry.tool_capability = CapabilityStatus.UNKNOWN.value
            entry.tool_capability_source = CapabilitySource.UNKNOWN.value


def _to_domain(record: ModelConnectionRecord) -> ModelConnection:
    enabled_model_ids = tuple(record.enabled_model_ids)
    return ModelConnection(
        id=record.id,
        display_name=record.display_name,
        provider_type=ModelProviderType(record.provider_type),
        protocol=ModelProtocol(record.protocol),
        base_url=record.base_url,
        auth_mode=ModelAuthMode(record.auth_mode),
        enabled=record.enabled,
        is_default=record.is_default,
        revision=record.revision,
        default_model_id=record.default_model_id,
        enabled_model_ids=enabled_model_ids,
        max_tokens_field=MaxTokensField(record.max_tokens_field),
        include_usage=record.include_usage,
        retry_policy=RETRY_POLICY.validate_python(record.retry_policy),
        credential=CredentialState(
            status=CredentialStatus(record.credential_status),
            configured=record.credential_configured,
            updated_at=_optional_utc(record.credential_updated_at),
        ),
        management_status=ManagementStatus(record.management_status),
        discovery=DiscoveryState(
            status=DiscoveryStatus(record.discovery_status),
            generation=record.discovery_generation,
            last_success_at=_optional_utc(record.discovery_last_success_at),
            error_code=record.discovery_error_code,
        ),
        check_generation=record.check_generation,
        catalog=tuple(
            _catalog_to_domain(entry, enabled_model_ids)
            for entry in sorted(record.catalog_entries, key=lambda item: item.model_id)
        ),
        created_at=as_utc(record.created_at),
        updated_at=as_utc(record.updated_at),
    )


def _catalog_to_domain(
    record: ModelCatalogEntryRecord, enabled_model_ids: tuple[str, ...]
) -> ModelCatalogEntry:
    return ModelCatalogEntry(
        model_id=record.model_id,
        display_name=record.display_name,
        sources=tuple(CatalogSource(source) for source in record.sources),
        revision=record.revision,
        availability=CatalogAvailability(record.availability),
        enabled=record.model_id in enabled_model_ids,
        text_check=ModelCheck(
            status=CheckStatus(record.text_check),
            checked_at=_optional_utc(record.text_checked_at),
            error_code=record.text_error_code,
        ),
        tool_check=ModelCheck(
            status=CheckStatus(record.tool_check),
            checked_at=_optional_utc(record.tool_checked_at),
            error_code=record.tool_error_code,
        ),
        tool_capability=CapabilityStatus(record.tool_capability),
        tool_capability_source=CapabilitySource(record.tool_capability_source),
        max_output_tokens=record.max_output_tokens,
        context_window=record.context_window,
        retention_tokens=record.retention_tokens,
        reasoning_settings=ModelReasoningSettings.model_validate(
            record.reasoning_settings
        )
        if record.reasoning_settings is not None
        else None,
        reasoning_efforts=tuple(record.reasoning_efforts),
        image_input=ModelImageInput.model_validate(record.image_input),
        reasoning_default=record.reasoning_default,
        reasoning_source=CapabilitySource(record.reasoning_source),
        discovered_at=_optional_utc(record.discovered_at),
    )


def _optional_utc(value: datetime | None) -> datetime | None:
    return as_utc(value) if value is not None else None
