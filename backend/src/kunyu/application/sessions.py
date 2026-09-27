import logging
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import uuid4

from kunyu.application.workspaces import WorkspaceNotFoundError
from kunyu.domain.events import AgentEvent
from kunyu.domain.sessions import (
    ArchivedSessionPage,
    ArchivedWorkspace,
    Session,
    SessionRepository,
)

MAX_SESSION_TITLE_LENGTH = 200


class InvalidSessionTitleError(ValueError):
    pass


class SessionNotFoundError(LookupError):
    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        super().__init__(f"Session '{session_id}' was not found.")


class SessionService:
    def __init__(
        self,
        repository: SessionRepository,
        *,
        session_id_factory: Callable[[], str] | None = None,
        event_id_factory: Callable[[], str] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._session_id_factory = session_id_factory or _new_session_id
        self._event_id_factory = event_id_factory or _new_event_id
        self._clock = clock or _utc_now

    def create(self, workspace_id: str, title: str) -> Session:
        normalized_title = title.strip()
        if not normalized_title:
            raise InvalidSessionTitleError("Session title must not be empty.")
        if len(normalized_title) > MAX_SESSION_TITLE_LENGTH:
            raise InvalidSessionTitleError(
                f"Session title must not exceed {MAX_SESSION_TITLE_LENGTH} characters."
            )

        now = self._clock()
        session = Session(
            id=self._session_id_factory(),
            workspace_id=workspace_id,
            title=normalized_title,
            created_at=now,
            updated_at=now,
        )
        created_event = AgentEvent(
            id=self._event_id_factory(),
            session_id=session.id,
            sequence=1,
            event_type="session.created",
            payload={"workspace_id": workspace_id, "title": normalized_title},
            occurred_at=now,
        )
        created_session = self._repository.add(session, created_event)
        if created_session is None:
            raise WorkspaceNotFoundError(workspace_id)
        return created_session

    def set_archived(self, session_id: str, archived: bool) -> Session:
        if not self._repository.set_archived(session_id, archived):
            raise SessionNotFoundError(session_id)
        logging.getLogger(__name__).info("Session %s archived=%s", session_id, archived)
        return self.get(session_id)

    def list_archived_groups(self, limit: int) -> list[ArchivedWorkspace]:
        return self._repository.list_archived_groups(limit)

    def archived_page(
        self, workspace_id: str, cursor: str | None, limit: int
    ) -> ArchivedSessionPage:
        return self._repository.archived_page(workspace_id, cursor, limit)

    def delete_archived(self, session_id: str) -> None:
        if not self._repository.delete_archived(session_id):
            raise SessionNotFoundError(session_id)
        logging.getLogger(__name__).info("Deleted archived session %s", session_id)

    def delete_archived_workspace(self, workspace_id: str) -> int:
        count = self._repository.delete_archived_workspace(workspace_id)
        logging.getLogger(__name__).info(
            "Deleted %s archived sessions in workspace %s", count, workspace_id
        )
        return count

    def get(self, session_id: str) -> Session:
        session = self._repository.get(session_id)
        if session is None:
            raise SessionNotFoundError(session_id)
        return session

    def list_for_workspace(self, workspace_id: str) -> list[Session]:
        sessions = self._repository.list_for_workspace(workspace_id)
        if sessions is None:
            raise WorkspaceNotFoundError(workspace_id)
        return sessions


def _new_session_id() -> str:
    return f"ses_{uuid4().hex}"


def _new_event_id() -> str:
    return f"evt_{uuid4().hex}"


def _utc_now() -> datetime:
    return datetime.now(UTC)
