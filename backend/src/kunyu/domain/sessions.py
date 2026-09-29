from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from kunyu.domain.events import AgentEvent


@dataclass(frozen=True, slots=True)
class Session:
    id: str
    workspace_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    archived: bool = False


class InvalidArchiveCursorError(ValueError):
    pass


class SessionNotArchivedError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class ArchivedSessionPage:
    items: list[Session]
    has_more: bool
    next_cursor: str | None


@dataclass(frozen=True, slots=True)
class ArchivedWorkspace:
    workspace_id: str
    workspace_name: str
    page: ArchivedSessionPage


class SessionRepository(Protocol):
    def set_archived(self, session_id: str, archived: bool) -> bool: ...

    def list_archived_groups(self, limit: int) -> list[ArchivedWorkspace]: ...

    def archived_page(
        self, workspace_id: str, cursor: str | None, limit: int
    ) -> ArchivedSessionPage: ...

    def delete_archived(self, session_id: str) -> bool: ...

    def delete_archived_workspace(self, workspace_id: str) -> int: ...

    def add(self, session: Session, created_event: AgentEvent) -> Session | None: ...

    def get(self, session_id: str) -> Session | None: ...

    def list_for_workspace(self, workspace_id: str) -> list[Session] | None: ...
