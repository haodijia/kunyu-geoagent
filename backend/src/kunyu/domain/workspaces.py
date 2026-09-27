from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True, slots=True)
class Workspace:
    id: str
    name: str
    created_at: datetime
    updated_at: datetime


class WorkspaceRepository(Protocol):
    def remove(self, workspace_id: str, dry_run: bool) -> int | None: ...

    def add(self, workspace: Workspace) -> Workspace: ...

    def get(self, workspace_id: str) -> Workspace | None: ...

    def list_recent(self) -> list[Workspace]: ...
