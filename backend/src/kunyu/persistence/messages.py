from typing import cast

from sqlalchemy import func, select

from kunyu.domain.events import AgentEvent
from kunyu.domain.messages import Message, MessageRole, MessageStatus
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    SessionEventRecord,
    MessageRecord,
    SessionRecord,
)
from kunyu.persistence.time import as_utc


class SQLAlchemyMessageRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def list_for_session(self, session_id: str) -> list[Message] | None:
        statement = (
            select(MessageRecord)
            .where(MessageRecord.session_id == session_id)
            .order_by(MessageRecord.sequence)
        )
        with self._database.sessions() as database_session:
            if database_session.get(SessionRecord, session_id) is None:
                return None
            records = database_session.scalars(statement).all()
            return [_message_to_domain(record) for record in records]

    def latest_event_sequence(self, session_id: str) -> int | None:
        with self._database.sessions() as database_session:
            if database_session.get(SessionRecord, session_id) is None:
                return None
            statement = select(func.max(SessionEventRecord.sequence)).where(
                SessionEventRecord.session_id == session_id
            )
            return database_session.scalar(statement) or 0

    def list_events_after(
        self,
        session_id: str,
        sequence: int,
        limit: int | None = None,
    ) -> list[AgentEvent]:
        statement = (
            select(SessionEventRecord)
            .where(
                SessionEventRecord.session_id == session_id,
                SessionEventRecord.sequence > sequence,
            )
            .order_by(SessionEventRecord.sequence)
        )
        if limit is not None:
            statement = statement.limit(limit)
        with self._database.sessions() as database_session:
            records = database_session.scalars(statement).all()
            return [_event_to_domain(record) for record in records]


def _message_to_domain(record: MessageRecord) -> Message:
    return Message(
        id=record.id,
        session_id=record.session_id,
        sequence=record.sequence,
        role=cast(MessageRole, record.role),
        content=record.content,
        run_id=record.run_id,
        step=record.step,
        attempt=record.attempt,
        status=cast(MessageStatus, record.status),
        content_length=record.content_length,
        updated_sequence=record.updated_sequence,
        created_at=as_utc(record.created_at),
        updated_at=as_utc(record.updated_at),
    )


def _event_to_domain(record: SessionEventRecord) -> AgentEvent:
    return AgentEvent(
        id=record.id,
        session_id=record.session_id,
        sequence=record.sequence,
        event_type=record.event_type,
        payload=record.payload,
        occurred_at=as_utc(record.occurred_at),
        run_id=record.run_id,
    )
