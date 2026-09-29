from dataclasses import dataclass

from pydantic import JsonValue

from kunyu.domain.messages import Message
from kunyu.domain.runs import RunDetails


class IdempotencyConflictError(RuntimeError):
    pass


class RunAcceptanceConflictError(RuntimeError):
    pass


class SessionArchivedAcceptanceError(RunAcceptanceConflictError):
    pass


class WorkspaceRemovedAcceptanceError(RunAcceptanceConflictError):
    pass


class RunAcceptanceNotFoundError(LookupError):
    pass


class ModelUnverifiedError(ValueError):
    pass


class UnsupportedModelCapabilityError(ValueError):
    pass


class CredentialUnavailableError(RuntimeError):
    pass


class InvalidMapContextError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class ModelSelection:
    connection_id: str
    model_id: str
    reasoning_effort: str | None


@dataclass(frozen=True, slots=True)
class RunAcceptanceRequest:
    session_id: str
    idempotency_key: str
    normalized_body: str
    content: str
    model_selection: ModelSelection
    map_context: dict[str, JsonValue]


@dataclass(frozen=True, slots=True)
class RunAcceptanceResult:
    message: Message
    run: RunDetails
