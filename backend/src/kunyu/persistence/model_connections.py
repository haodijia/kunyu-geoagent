from datetime import datetime

from sqlalchemy import delete, select, text, update

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
)
from kunyu.persistence.database import Database
from kunyu.persistence.models import ModelCatalogEntryRecord, ModelConnectionRecord
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
    record.credential_status = connection.credential.status.value
    record.credential_configured = connection.credential.configured
    record.credential_updated_at = connection.credential.updated_at
    record.management_status = connection.management_status.value
    record.discovery_status = connection.discovery.status.value
    record.discovery_generation = connection.discovery.generation
    record.discovery_last_success_at = connection.discovery.last_success_at
    record.discovery_error_code = connection.discovery.error_code
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
    record.reasoning_efforts = list(entry.reasoning_efforts)
    record.reasoning_source = entry.reasoning_source.value
    record.discovered_at = entry.discovered_at


def _to_domain(record: ModelConnectionRecord) -> ModelConnection:
    enabled_model_ids = tuple(record.enabled_model_ids)
    return ModelConnection(
        id=record.id,
        display_name=record.display_name,
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
        reasoning_efforts=tuple(record.reasoning_efforts),
        reasoning_source=CapabilitySource(record.reasoning_source),
        discovered_at=_optional_utc(record.discovered_at),
    )


def _optional_utc(value: datetime | None) -> datetime | None:
    return as_utc(value) if value is not None else None
