from datetime import datetime

from sqlalchemy import func, select, text

from kunyu.domain.events import AgentEvent
from kunyu.domain.messages import Message, MessageRole
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    AgentEventRecord,
    MessageRecord,
    SessionRecord,
    WorkspaceRecord,
)
from kunyu.persistence.time import as_utc


class SQLAlchemyMessageRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def append(
        self,
        message_id: str,
        event_id: str,
        session_id: str,
        role: MessageRole,
        content: str,
        occurred_at: datetime,
    ) -> tuple[Message, AgentEvent] | None:
        with self._database.sessions() as database_session:
            database_session.execute(text("BEGIN IMMEDIATE"))
            session_record = database_session.get(SessionRecord, session_id)
            if session_record is None:
                database_session.rollback()
                return None

            message_sequence_statement = select(
                func.max(MessageRecord.sequence)
            ).where(MessageRecord.session_id == session_id)
            message_sequence = (
                database_session.scalar(message_sequence_statement) or 0
            ) + 1
            event_sequence_statement = select(
                func.max(AgentEventRecord.sequence)
            ).where(AgentEventRecord.session_id == session_id)
            event_sequence = (
                database_session.scalar(event_sequence_statement) or 0
            ) + 1
            message_record = MessageRecord(
                id=message_id,
                session_id=session_id,
                sequence=message_sequence,
                role=role,
                content=content,
                created_at=occurred_at,
            )
            event_record = AgentEventRecord(
                id=event_id,
                session_id=session_id,
                sequence=event_sequence,
                event_type="message.user.appended",
                payload={"message_id": message_id, "role": role},
                occurred_at=occurred_at,
            )
            session_record.updated_at = occurred_at
            workspace_record = database_session.get(
                WorkspaceRecord, session_record.workspace_id
            )
            if workspace_record is None:
                raise RuntimeError(
                    f"Session '{session_id}' references a missing workspace."
                )
            workspace_record.updated_at = occurred_at

            database_session.add_all((message_record, event_record))
            database_session.commit()

        return _message_to_domain(message_record), _event_to_domain(event_record)

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
            statement = select(func.max(AgentEventRecord.sequence)).where(
                AgentEventRecord.session_id == session_id
            )
            return database_session.scalar(statement) or 0

    def list_events_after(
        self, session_id: str, sequence: int
    ) -> list[AgentEvent]:
        statement = (
            select(AgentEventRecord)
            .where(
                AgentEventRecord.session_id == session_id,
                AgentEventRecord.sequence > sequence,
            )
            .order_by(AgentEventRecord.sequence)
        )
        with self._database.sessions() as database_session:
            records = database_session.scalars(statement).all()
            return [_event_to_domain(record) for record in records]

def _message_to_domain(record: MessageRecord) -> Message:
    return Message(
        id=record.id,
        session_id=record.session_id,
        sequence=record.sequence,
        role=record.role,
        content=record.content,
        created_at=as_utc(record.created_at),
    )


def _event_to_domain(record: AgentEventRecord) -> AgentEvent:
    return AgentEvent(
        id=record.id,
        session_id=record.session_id,
        sequence=record.sequence,
        event_type=record.event_type,
        payload=record.payload,
        occurred_at=as_utc(record.occurred_at),
    )
