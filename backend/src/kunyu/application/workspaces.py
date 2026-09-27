import logging
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import uuid4

from kunyu.domain.workspaces import Workspace, WorkspaceRepository

MAX_WORKSPACE_NAME_LENGTH = 200


class InvalidWorkspaceNameError(ValueError):
    pass


class WorkspaceNotFoundError(LookupError):
    def __init__(self, workspace_id: str) -> None:
        self.workspace_id = workspace_id
        super().__init__(f"Workspace '{workspace_id}' was not found.")


class WorkspaceService:
    def __init__(
        self,
        repository: WorkspaceRepository,
        *,
        id_factory: Callable[[], str] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._id_factory = id_factory or _new_workspace_id
        self._clock = clock or _utc_now

    def create(self, name: str) -> Workspace:
        normalized_name = name.strip()
        if not normalized_name:
            raise InvalidWorkspaceNameError("Workspace name must not be empty.")
        if len(normalized_name) > MAX_WORKSPACE_NAME_LENGTH:
            raise InvalidWorkspaceNameError(
                "Workspace name must not exceed "
                f"{MAX_WORKSPACE_NAME_LENGTH} characters."
            )

        now = self._clock()
        workspace = Workspace(
            id=self._id_factory(),
            name=normalized_name,
            created_at=now,
            updated_at=now,
        )
        return self._repository.add(workspace)

    def remove(self, workspace_id: str, dry_run: bool = False) -> int:
        count = self._repository.remove(workspace_id, dry_run)
        if count is None:
            raise WorkspaceNotFoundError(workspace_id)
        if not dry_run:
            logging.getLogger(__name__).info("Removed workspace %s and %s sessions", workspace_id, count)
        return count

    def get(self, workspace_id: str) -> Workspace:
        workspace = self._repository.get(workspace_id)
        if workspace is None:
            raise WorkspaceNotFoundError(workspace_id)
        return workspace

    def list(self) -> list[Workspace]:
        return self._repository.list_recent()


def _new_workspace_id() -> str:
    return f"ws_{uuid4().hex}"


def _utc_now() -> datetime:
    return datetime.now(UTC)
