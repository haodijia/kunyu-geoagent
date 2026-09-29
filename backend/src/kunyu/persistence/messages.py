from datetime import datetime
from typing import Literal, cast

from sqlalchemy import func, select, text

from dsh.events import EventBatch, UserMessageAppendedEvent, UserMessageAppendedPayload
from kunyu.domain.events import AgentEvent
from kunyu.domain.messages import Message, MessageRole, MessageStatus
from kunyu.domain.sessions import SessionArchivedError
from kunyu.persistence.agent_projections import SQLAlchemyAgentProjectionService
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
        self._projections = SQLAlchemyAgentProjectionService(database)

    def append(
        self,
        message_id: str,
        session_id: str,
        role: Literal["user"],
        content: str,
        occurred_at: datetime,
    ) -> tuple[Message, AgentEvent] | None:
        with self._database.sessions() as database_session:
            database_session.execute(text("BEGIN IMMEDIATE"))
            session_record = database_session.get(SessionRecord, session_id)
            if session_record is None:
                database_session.rollback()
                return None

            if session_record.archive is not None:
                raise SessionArchivedError("Archived sessions cannot receive messages.")

            event = UserMessageAppendedEvent(
                session_id=session_id,
                run_id=None,
                event_type="message.user.appended",
                payload=UserMessageAppendedPayload(
                    message_id=message_id,
                    role=role,
                    content=content,
                    run_id=None,
                ),
                occurred_at=occurred_at,
            )
            events = self._projections.commit_in_transaction(
                database_session,
                EventBatch(
                    session_id=session_id,
                    run_id=None,
                    events=(event,),
                ),
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

            database_session.commit()

            message_record = database_session.get(MessageRecord, message_id)
            if message_record is None:
                raise RuntimeError("User message projection was not persisted.")

        return _message_to_domain(message_record), events[0]

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


def _event_to_domain(record: AgentEventRecord) -> AgentEvent:
    return AgentEvent(
        id=record.id,
        session_id=record.session_id,
        sequence=record.sequence,
        event_type=record.event_type,
        payload=record.payload,
        occurred_at=as_utc(record.occurred_at),
        run_id=record.run_id,
    )
