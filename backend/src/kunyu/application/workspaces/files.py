"""Upload admission and publication into active, conversation-independent workspaces."""

from collections.abc import AsyncIterable, Iterator
from contextlib import contextmanager
from threading import Event
from typing import Literal

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from kunyu.application.workspaces.service import WorkspaceNotFoundError
from kunyu.domain.workspaces.workspace_files import (
    MAX_WORKSPACE_FILE_BYTES,
    WorkspaceContent,
    WorkspaceFile,
    WorkspaceListing,
)
from kunyu.integrations.filesystem.browse import WorkspaceBrowser
from kunyu.integrations.filesystem.operation import filesystem_operation
from kunyu.integrations.filesystem.workspaces import (
    ManagedWorkspaceFiles,
    validate_filename,
)
from kunyu.persistence.database import Database
from kunyu.persistence.records.workspaces import WorkspaceRecord, WorkspaceRemovalRecord


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
        self.browser = WorkspaceBrowser(database.path.parent)

    async def list(self, workspace_id: str, file_path: str) -> WorkspaceListing:
        with self.database.sessions() as transaction:
            require_active_workspace(transaction, workspace_id)
        return await filesystem_operation(
            lambda cancelled: self.browser.list(workspace_id, file_path, cancelled)
        )

    @contextmanager
    def open(
        self, workspace_id: str, file_path: str, max_bytes: int | None
    ) -> Iterator[WorkspaceContent]:
        with self.database.sessions() as transaction:
            require_active_workspace(transaction, workspace_id)
        with self.browser.open(workspace_id, file_path, max_bytes) as content:
            yield content

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
