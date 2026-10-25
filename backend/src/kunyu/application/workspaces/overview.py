"""Read-only workspace overview admission."""

from kunyu.application.workspaces.files import require_active_workspace
from kunyu.domain.workspaces.overview import WorkspaceOverviewData
from kunyu.persistence.database import Database
from kunyu.persistence.workspaces.overview import WorkspaceOverviewRepository


class WorkspaceOverviewService:
    def __init__(self, database: Database) -> None:
        self.database = database
        self.repository = WorkspaceOverviewRepository(database)

    def read(self, workspace_id: str) -> WorkspaceOverviewData:
        with self.database.sessions() as tx:
            require_active_workspace(tx, workspace_id)
        return self.repository.read(workspace_id)
