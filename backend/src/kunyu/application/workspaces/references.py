"""Workspace references resolve business IDs to the same paths used by file tools."""

from pydantic import TypeAdapter
from sqlalchemy import select

from kunyu.application.workspaces.files import require_active_workspace
from kunyu.domain.conversation.attachments import (
    Attachment,
    ImageAttachment,
    attachment_path,
)
from kunyu.domain.workspaces.workspace_files import WorkspaceResource
from kunyu.integrations.filesystem.operation import filesystem_operation
from kunyu.integrations.filesystem.workspaces import ManagedWorkspaceFiles
from kunyu.persistence.database import Database
from kunyu.persistence.records.conversation import (
    SessionAttachmentRecord,
    SessionRecord,
)
from kunyu.persistence.records.geospatial import AnalysisOutputRecord

REFERENCE = TypeAdapter(Attachment)


class WorkspaceReferences:
    def __init__(self, database: Database) -> None:
        self.database = database
        self.files = ManagedWorkspaceFiles(database.path.parent)

    def business_references(self, workspace_id: str) -> list[WorkspaceResource]:
        with self.database.sessions() as tx:
            require_active_workspace(tx, workspace_id)
            references = []
            attachments = tx.execute(
                select(SessionAttachmentRecord, SessionRecord.title)
                .join(
                    SessionRecord,
                    SessionRecord.id == SessionAttachmentRecord.session_id,
                )
                .where(SessionRecord.workspace_id == workspace_id)
                .order_by(SessionAttachmentRecord.created_at.desc())
            )
            for record, title in attachments:
                ref = REFERENCE.validate_python(record.receipt)
                if isinstance(ref, ImageAttachment) and ref.producer is not None:
                    continue
                path = attachment_path(ref)
                references.append(
                    WorkspaceResource(
                        name=ref.name,
                        file_path=path,
                        kind=ref.kind,
                        detail=f"{path} · {title}",
                    )
                )
            for output in tx.scalars(
                select(AnalysisOutputRecord)
                .where(AnalysisOutputRecord.workspace_id == workspace_id)
                .order_by(AnalysisOutputRecord.created_at.desc())
            ):
                path = "/workspace/" + output.cog_file.split("/", 1)[1]
                references.append(
                    WorkspaceResource(
                        name=output.title,
                        file_path=path,
                        kind="result",
                        detail=f"{path} · {output.source_session_title}",
                    )
                )
            return references

    async def search(
        self, workspace_id: str, query: str, limit: int
    ) -> list[WorkspaceResource]:
        references = self.business_references(workspace_id)
        files = await filesystem_operation(
            lambda cancelled: self.files.search(workspace_id, query, limit, cancelled)
        )
        references.extend(
            WorkspaceResource(
                name=file.name,
                file_path=file.file_path,
                kind=file.kind,
                detail=file.file_path,
            )
            for file in files
        )
        needle = query.casefold()
        return [
            ref
            for ref in references
            if needle in (ref.name + " " + ref.detail).casefold()
        ][:limit]
