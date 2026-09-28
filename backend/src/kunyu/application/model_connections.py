from collections.abc import Callable, Mapping, Sequence
from dataclasses import replace
from datetime import UTC, datetime
from urllib.parse import SplitResult, urlsplit, urlunsplit
from uuid import uuid4

from kunyu.application.connection_locks import ConnectionOperationLocks
from kunyu.domain.model_connections import (
    CatalogAvailability,
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
    ModelConnectionRepository,
    ModelProtocol,
)

MAX_DISPLAY_NAME_LENGTH = 200
MAX_BASE_URL_LENGTH = 2_048
MAX_MODEL_ID_LENGTH = 256
EXECUTION_FIELDS = {
    "base_url",
    "auth_mode",
    "max_tokens_field",
    "include_usage",
}
PATCH_FIELDS = EXECUTION_FIELDS | {
    "display_name",
    "enabled",
    "enabled_model_ids",
    "default_model_id",
    "is_default",
}


class InvalidModelConnectionError(ValueError):
    pass


class ModelConnectionNotFoundError(LookupError):
    def __init__(self, connection_id: str) -> None:
        self.connection_id = connection_id
        super().__init__(f"Model connection '{connection_id}' was not found.")


class DefaultModelConnectionError(ValueError):
    pass


class ModelConnectionBusyError(ValueError):
    pass


class ModelConnectionService:
    def __init__(
        self,
        repository: ModelConnectionRepository,
        locks: ConnectionOperationLocks,
        *,
        id_factory: Callable[[], str] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._locks = locks
        self._id_factory = id_factory or _new_connection_id
        self._clock = clock or _utc_now

    def create(
        self,
        *,
        display_name: str,
        protocol: ModelProtocol,
        base_url: str,
        auth_mode: ModelAuthMode,
        max_tokens_field: MaxTokensField,
        include_usage: bool,
    ) -> ModelConnection:
        if protocol is not ModelProtocol.OPENAI_COMPATIBLE:
            raise InvalidModelConnectionError("Unsupported model protocol.")
        if not isinstance(auth_mode, ModelAuthMode):
            raise InvalidModelConnectionError("Unsupported authentication mode.")
        if not isinstance(max_tokens_field, MaxTokensField):
            raise InvalidModelConnectionError("Unsupported max tokens field.")
        if not isinstance(include_usage, bool):
            raise InvalidModelConnectionError("include_usage must be a boolean.")
        now = self._clock()
        normalized_name = _normalize_display_name(display_name)
        normalized_url = _normalize_base_url(base_url)
        credential = _initial_credential(auth_mode)
        connection = ModelConnection(
            id=self._id_factory(),
            display_name=normalized_name,
            protocol=protocol,
            base_url=normalized_url,
            auth_mode=auth_mode,
            enabled=True,
            is_default=False,
            revision=1,
            default_model_id=None,
            enabled_model_ids=(),
            max_tokens_field=max_tokens_field,
            include_usage=include_usage,
            credential=credential,
            management_status=ManagementStatus.READY,
            discovery=DiscoveryState(
                status=DiscoveryStatus.IDLE,
                generation=0,
                last_success_at=None,
                error_code=None,
            ),
            catalog=(),
            created_at=now,
            updated_at=now,
        )
        return self._repository.add(connection)

    def get(self, connection_id: str) -> ModelConnection:
        connection = self._repository.get(connection_id)
        if connection is None:
            raise ModelConnectionNotFoundError(connection_id)
        return connection

    def list(self) -> list[ModelConnection]:
        return self._repository.list()

    def update(
        self, connection_id: str, changes: Mapping[str, object]
    ) -> ModelConnection:
        with self._locks.hold(connection_id):
            return self._update(connection_id, changes)

    def _update(
        self, connection_id: str, changes: Mapping[str, object]
    ) -> ModelConnection:
        if not changes:
            raise InvalidModelConnectionError("At least one field must be provided.")
        unknown_fields = changes.keys() - PATCH_FIELDS
        if unknown_fields:
            raise InvalidModelConnectionError(
                f"Unsupported field '{min(unknown_fields)}'."
            )

        current = self.get(connection_id)
        _require_ready(current)
        values: dict[str, object] = dict(changes)
        for field in (
            "display_name",
            "base_url",
            "auth_mode",
            "enabled",
            "enabled_model_ids",
            "max_tokens_field",
            "include_usage",
            "is_default",
        ):
            if field in values and values[field] is None:
                raise InvalidModelConnectionError(f"'{field}' must not be null.")
        if "display_name" in values:
            values["display_name"] = _normalize_display_name(values["display_name"])
        if "base_url" in values:
            values["base_url"] = _normalize_base_url(values["base_url"])
        if "auth_mode" in values and not isinstance(values["auth_mode"], ModelAuthMode):
            raise InvalidModelConnectionError("Unsupported authentication mode.")
        if (
            "auth_mode" in values
            and values["auth_mode"] != current.auth_mode
            and current.credential.configured is True
        ):
            raise InvalidModelConnectionError(
                "Clear the credential before changing authentication mode."
            )
        if "max_tokens_field" in values and not isinstance(
            values["max_tokens_field"], MaxTokensField
        ):
            raise InvalidModelConnectionError("Unsupported max tokens field.")
        for field in ("enabled", "include_usage", "is_default"):
            if field in values and not isinstance(values[field], bool):
                raise InvalidModelConnectionError(f"'{field}' must be a boolean.")

        if values.get("enabled") is False and current.is_default:
            raise DefaultModelConnectionError(
                "Clear the default connection before disabling it."
            )
        if values.get("is_default") is True:
            raise InvalidModelConnectionError(
                "Use the default endpoint to select a default connection."
            )

        enabled_model_ids = current.enabled_model_ids
        if "enabled_model_ids" in values:
            enabled_model_ids = _normalize_model_ids(values["enabled_model_ids"])
            known_ids = {entry.model_id for entry in current.catalog}
            unknown_ids = [item for item in enabled_model_ids if item not in known_ids]
            if unknown_ids:
                raise InvalidModelConnectionError(
                    f"Unknown catalog model '{unknown_ids[0]}'."
                )
            values["enabled_model_ids"] = enabled_model_ids

        if "default_model_id" in values:
            default_model_id = _normalize_optional_model_id(values["default_model_id"])
        else:
            default_model_id = current.default_model_id
            if (
                "enabled_model_ids" in values
                and default_model_id not in enabled_model_ids
            ):
                default_model_id = None
                values["default_model_id"] = None

        if "default_model_id" in values:
            values["default_model_id"] = default_model_id
        if "default_model_id" in changes and default_model_id is not None:
            _validate_default_model(current, default_model_id, enabled_model_ids)

        execution_changed = any(
            field in values and values[field] != getattr(current, field)
            for field in EXECUTION_FIELDS
        )
        if execution_changed:
            if (
                values.get("default_model_id") is not None
                and "default_model_id" in values
            ):
                raise InvalidModelConnectionError(
                    "Default model cannot be selected while execution settings change."
                )
            values["revision"] = current.revision + 1
            values["catalog"] = tuple(
                _invalidate_entry(entry) for entry in current.catalog
            )
            values["discovery"] = replace(
                current.discovery,
                status=DiscoveryStatus.IDLE,
                last_success_at=None,
                error_code=None,
            )
            if "auth_mode" in values:
                values["credential"] = _initial_credential(values["auth_mode"])

        values["updated_at"] = self._clock()
        return self._repository.update(replace(current, **values))

    def set_default(self, connection_id: str) -> ModelConnection:
        with self._locks.hold_default_selection():
            default_ids = {item.id for item in self.list() if item.is_default}
            with self._locks.hold_many(default_ids | {connection_id}):
                current = self.get(connection_id)
                _require_ready(current)
                for default_id in default_ids:
                    _require_ready(self.get(default_id))
                if not current.enabled:
                    raise InvalidModelConnectionError(
                        "A disabled connection cannot be the default."
                    )
                connection = self._repository.set_default(connection_id, self._clock())
                if connection is None:
                    raise ModelConnectionNotFoundError(connection_id)
                return connection

    def delete(self, connection_id: str) -> None:
        with self._locks.hold(connection_id):
            connection = self.get(connection_id)
            _require_ready(connection)
            if connection.is_default:
                raise DefaultModelConnectionError(
                    "Clear the default connection before deleting it."
                )
            if not self._repository.delete(connection_id):
                raise ModelConnectionNotFoundError(connection_id)


def _normalize_display_name(value: object) -> str:
    if not isinstance(value, str):
        raise InvalidModelConnectionError("Display name must be a string.")
    normalized = value.strip()
    if not normalized:
        raise InvalidModelConnectionError("Display name must not be empty.")
    if len(normalized) > MAX_DISPLAY_NAME_LENGTH:
        raise InvalidModelConnectionError(
            f"Display name must not exceed {MAX_DISPLAY_NAME_LENGTH} characters."
        )
    return normalized


def _require_ready(connection: ModelConnection) -> None:
    if connection.management_status is not ManagementStatus.READY:
        raise ModelConnectionBusyError(
            "The model connection has an unfinished management operation."
        )


def _normalize_base_url(value: object) -> str:
    if not isinstance(value, str):
        raise InvalidModelConnectionError("Base URL must be a string.")
    normalized = value.strip()
    if not normalized or len(normalized) > MAX_BASE_URL_LENGTH:
        raise InvalidModelConnectionError("Base URL is invalid.")
    if any(character.isspace() for character in normalized):
        raise InvalidModelConnectionError("Base URL must not include whitespace.")
    try:
        parsed = urlsplit(normalized)
        _validate_parsed_url(parsed)
        _ = parsed.port
    except ValueError as error:
        raise InvalidModelConnectionError("Base URL is invalid.") from error
    path = parsed.path.rstrip("/")
    return urlunsplit((parsed.scheme.lower(), parsed.netloc, path, "", ""))


def _validate_parsed_url(parsed: SplitResult) -> None:
    if parsed.scheme.lower() not in {"http", "https"}:
        raise InvalidModelConnectionError("Base URL must use HTTP or HTTPS.")
    if parsed.hostname is None:
        raise InvalidModelConnectionError("Base URL must include a host.")
    if parsed.username is not None or parsed.password is not None:
        raise InvalidModelConnectionError("Base URL must not include user info.")
    if parsed.query or parsed.fragment:
        raise InvalidModelConnectionError(
            "Base URL must not include a query or fragment."
        )


def _normalize_model_ids(value: object) -> tuple[str, ...]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise InvalidModelConnectionError("Enabled model IDs must be a list.")
    normalized: list[str] = []
    seen: set[str] = set()
    for candidate in value:
        model_id = _normalize_model_id(candidate)
        if model_id in seen:
            raise InvalidModelConnectionError(
                f"Duplicate enabled model ID '{model_id}'."
            )
        seen.add(model_id)
        normalized.append(model_id)
    return tuple(normalized)


def _normalize_optional_model_id(value: object) -> str | None:
    if value is None:
        return None
    return _normalize_model_id(value)


def _normalize_model_id(value: object) -> str:
    if not isinstance(value, str):
        raise InvalidModelConnectionError("Model ID must be a string.")
    normalized = value.strip()
    if not normalized or len(normalized) > MAX_MODEL_ID_LENGTH:
        raise InvalidModelConnectionError("Model ID is invalid.")
    return normalized


def _validate_default_model(
    connection: ModelConnection,
    model_id: str,
    enabled_model_ids: tuple[str, ...],
) -> None:
    if model_id not in enabled_model_ids:
        raise InvalidModelConnectionError(
            "Default model must be included in enabled model IDs."
        )
    entry = next(
        (item for item in connection.catalog if item.model_id == model_id), None
    )
    if (
        entry is None
        or entry.revision != connection.revision
        or entry.availability is not CatalogAvailability.AVAILABLE
        or not entry.agent_verified
    ):
        raise InvalidModelConnectionError(
            "Default model must be available and pass text and tool checks."
        )


def _invalidate_entry(entry: ModelCatalogEntry) -> ModelCatalogEntry:
    unchecked = ModelCheck(CheckStatus.UNCHECKED, None, None)
    return replace(
        entry,
        availability=CatalogAvailability.UNAVAILABLE,
        text_check=unchecked,
        tool_check=unchecked,
    )


def _initial_credential(auth_mode: object) -> CredentialState:
    if auth_mode is ModelAuthMode.NONE:
        return CredentialState(CredentialStatus.READY, False, None)
    if auth_mode is ModelAuthMode.API_KEY:
        return CredentialState(CredentialStatus.MISSING, False, None)
    raise InvalidModelConnectionError("Unsupported authentication mode.")


def _new_connection_id() -> str:
    return f"conn_{uuid4().hex}"


def _utc_now() -> datetime:
    return datetime.now(UTC)
