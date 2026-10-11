"""Upload admission and publication into active, conversation-independent workspaces."""

from collections.abc import AsyncIterable
from threading import Event
from typing import Literal

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from kunyu.application.workspaces import WorkspaceNotFoundError
from kunyu.domain.workspace_files import MAX_WORKSPACE_FILE_BYTES, WorkspaceFile
from kunyu.integrations.filesystem_operation import filesystem_operation
from kunyu.integrations.workspace_files import ManagedWorkspaceFiles, validate_filename
from kunyu.persistence.database import Database
from kunyu.persistence.models import WorkspaceRecord, WorkspaceRemovalRecord


class WorkspaceFileTooLargeError(ValueError):
    pass


def require_active_workspace(transaction: Session, workspace_id: str) -> None:
    record = transaction.scalar(
        select(WorkspaceRecord.id).where(
            WorkspaceRecord.id == workspace_id,
            ~WorkspaceRecord.id.in_(select(WorkspaceRemovalRecord.workspace_id)),
        )
    )
    if record is None:
        raise WorkspaceNotFoundError(workspace_id)


class WorkspaceFileService:
    def __init__(self, database: Database) -> None:
        self.database = database
        self.storage = ManagedWorkspaceFiles(database.path.parent)

    async def upload(
        self,
        workspace_id: str,
        name: str,
        kind: Literal["file", "image"],
        body: AsyncIterable[bytes],
    ) -> WorkspaceFile:
        validate_filename(name)
        with self.database.sessions() as transaction:
            require_active_workspace(transaction, workspace_id)
        content = bytearray()
        async for chunk in body:
            if len(content) + len(chunk) > MAX_WORKSPACE_FILE_BYTES:
                raise WorkspaceFileTooLargeError(
                    "Workspace files may contain at most 64 MiB."
                )
            content.extend(chunk)
        data = bytes(content)
        del content
        return await filesystem_operation(
            lambda cancelled: self._save(workspace_id, name, kind, data, cancelled)
        )

    def _save(
        self,
        workspace_id: str,
        name: str,
        kind: Literal["file", "image"],
        data: bytes,
        cancelled: Event,
    ) -> WorkspaceFile:
        with self.database.sessions.begin() as transaction:
            transaction.execute(text("BEGIN IMMEDIATE"))
            require_active_workspace(transaction, workspace_id)
            return self.storage.save(workspace_id, name, kind, data, cancelled)
