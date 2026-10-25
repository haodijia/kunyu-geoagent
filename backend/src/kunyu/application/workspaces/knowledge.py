"""User-authored memories and version-checked workspace instruction editing."""

from datetime import UTC, datetime
from threading import Event
from uuid import uuid4

from sqlalchemy import text

from kunyu.application.workspaces.files import require_active_workspace
from kunyu.domain.workspaces.filesystem import (
    FilesystemError,
    FilesystemScope,
)
from kunyu.domain.workspaces.overview import MemoryItem
from kunyu.integrations.filesystem.instructions import write_instructions
from kunyu.integrations.filesystem.local import MountedFilesystem
from kunyu.persistence.database import Database
from kunyu.persistence.records.workspaces import WorkspaceMemoryRecord


class KnowledgeConflictError(ValueError):
    pass


class MemoryNotFoundError(LookupError):
    pass


class WorkspaceKnowledgeService:
    def __init__(self, database: Database) -> None:
        self.database = database
        self.filesystem = MountedFilesystem(database.path.parent)

    def save_memory(
        self,
        workspace_id: str,
        content: str,
        memory_id: str | None,
        expected_content: str | None,
    ) -> MemoryItem:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_active_workspace(tx, workspace_id)
            if memory_id is None:
                identity = str(uuid4())
                row = WorkspaceMemoryRecord(
                    id=f"mem_{identity}",
                    workspace_id=workspace_id,
                    content=content,
                    source_tool_call_id=f"workspace_editor:{identity}",
                    created_at=datetime.now(UTC),
                )
                tx.add(row)
            else:
                row = tx.get(WorkspaceMemoryRecord, memory_id)
                if row is None or row.workspace_id != workspace_id:
                    raise MemoryNotFoundError("Workspace memory was not found.")
                if row.content != expected_content:
                    raise KnowledgeConflictError(
                        "Memory changed. Reload it before saving."
                    )
                row.content = content
            tx.flush()
            return MemoryItem(id=row.id, content=row.content, created_at=row.created_at)

    def instructions(self, workspace_id: str) -> dict:
        with self.database.sessions() as tx:
            require_active_workspace(tx, workspace_id)
        target = self.filesystem.resolve(
            "/workspace/AGENTS.md", FilesystemScope(workspace_id, None)
        )
        cancelled = Event()
        before = self.filesystem.stat(target, cancelled)
        if before is None:
            return {"content": "", "version": None}
        if before.size is not None and before.size > 128 * 1024:
            raise FilesystemError("FS_TOO_LARGE", "Instructions exceed 128 KiB.")
        content = self.filesystem.read_text(target, cancelled)
        if len(content.encode("utf-8")) > 128 * 1024:
            raise FilesystemError("FS_TOO_LARGE", "Instructions exceed 128 KiB.")
        if self.filesystem.stat(target, cancelled) != before:
            raise KnowledgeConflictError("Instructions changed while being read.")
        return {"content": content, "version": before.version}

    def save_instructions(
        self, workspace_id: str, content: str, version: str | None
    ) -> dict:
        if len(content.encode("utf-8")) > 128 * 1024:
            raise FilesystemError("FS_TOO_LARGE", "Instructions exceed 128 KiB.")
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_active_workspace(tx, workspace_id)
            target = self.filesystem.resolve(
                "/workspace/AGENTS.md", FilesystemScope(workspace_id, None)
            )
            saved_version = write_instructions(
                self.database.path.parent, target, content, version
            )
            return {"content": content, "version": saved_version}
