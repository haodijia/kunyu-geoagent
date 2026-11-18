"""Save object-linked field evidence in the session journal."""

from datetime import UTC, datetime

from sqlalchemy import select, text

from kunyu.agent.runtime.events.session import (
    ContextInjectedEvent,
    ContextInjectedPayload,
)
from kunyu.agent.runtime.events.store import EventBatch
from kunyu.domain.conversation.attachments import AttachmentError, ImageAttachment
from kunyu.domain.geospatial.field_observation import (
    FIELD_OBSERVATION,
    FieldObservation,
    RecordFieldObservation,
)
from kunyu.domain.geospatial.object_review import ReviewTarget
from kunyu.persistence.conversation.attachments import (
    require_session,
    resolve_references,
)
from kunyu.persistence.database import Database
from kunyu.persistence.execution.agent_projections import (
    SQLAlchemyAgentProjectionService,
)
from kunyu.persistence.records.execution import SessionEventRecord


class FieldObservations:
    def __init__(self, database: Database) -> None:
        self.database = database

    def workspace(self, session_id: str) -> str:
        with self.database.sessions() as tx:
            return require_session(tx, session_id, writable=True).workspace_id

    def record(
        self,
        session_id: str,
        workspace: str,
        target: ReviewTarget,
        body: RecordFieldObservation,
    ) -> FieldObservation:
        with self.database.sessions() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            if require_session(tx, session_id, writable=True).workspace_id != workspace:
                raise AttachmentError("NOT_FOUND", "会话不属于当前工作区。", 404)
            photos = resolve_references(
                tx, session_id, tuple(str(i) for i in body.photo_ids)
            )
            if any(
                not isinstance(photo, ImageAttachment) or photo.producer is not None
                for photo in photos
            ):
                raise AttachmentError(
                    "INVALID_ATTACHMENT", "现场照片须为本会话上传的图片。", 422
                )
            observation = FieldObservation(
                id=body.id,
                reference=target.reference,
                observed_at=body.observed_at.astimezone(UTC),
                note=body.note,
                photos=photos,
            )
            metadata = observation.model_dump(mode="json")
            existing = tx.scalar(
                select(SessionEventRecord).where(
                    SessionEventRecord.session_id == session_id,
                    SessionEventRecord.event_type == "context.injected",
                    SessionEventRecord.payload["producer"].as_string()
                    == FIELD_OBSERVATION,
                    SessionEventRecord.payload["metadata"]["id"].as_string()
                    == str(body.id),
                )
            )
            if existing is not None:
                if existing.payload["metadata"] != metadata:
                    raise AttachmentError(
                        "OBSERVATION_CONFLICT",
                        "该现场记录已保存，请为新记录重新提交。",
                        409,
                    )
                return observation
            event = ContextInjectedEvent(
                session_id=session_id,
                run_id=None,
                event_type="context.injected",
                payload=ContextInjectedPayload(
                    producer=FIELD_OBSERVATION,
                    content=f"已记录现场核查 · {target.name or '未命名对象'}",
                    metadata=metadata,
                ),
                occurred_at=datetime.now(UTC),
            )
            SQLAlchemyAgentProjectionService(self.database).commit_in_transaction(
                tx, EventBatch(session_id, None, (event,))
            )
            tx.commit()
        return observation
