from sqlalchemy import select

from kunyu.domain.confirmations import Confirmation, ConfirmationStatus
from kunyu.persistence.database import Database
from kunyu.persistence.models import ConfirmationRecord, SessionRecord
from kunyu.persistence.time import as_utc


class SQLAlchemyConfirmationRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def list_for_session(self, session_id: str) -> tuple[Confirmation, ...] | None:
        with self._database.sessions() as database_session:
            if database_session.get(SessionRecord, session_id) is None:
                return None
            records = database_session.scalars(
                select(ConfirmationRecord)
                .where(ConfirmationRecord.session_id == session_id)
                .order_by(ConfirmationRecord.created_at, ConfirmationRecord.id)
            ).all()
            return tuple(confirmation_to_domain(record) for record in records)

    def get(self, confirmation_id: str) -> Confirmation | None:
        with self._database.sessions() as database_session:
            record = database_session.get(ConfirmationRecord, confirmation_id)
            return confirmation_to_domain(record) if record is not None else None


def confirmation_record(confirmation: Confirmation) -> ConfirmationRecord:
    return ConfirmationRecord(
        id=confirmation.id,
        session_id=confirmation.session_id,
        run_id=confirmation.run_id,
        tool_call_id=confirmation.tool_call_id,
        workspace_id=confirmation.workspace_id,
        name=confirmation.name,
        arguments=confirmation.arguments,
        summary=confirmation.summary,
        side_effect=confirmation.side_effect,
        execution=confirmation.execution,
        binding=confirmation.binding,
        status=confirmation.status.value,
        decided_at=confirmation.decided_at,
        created_at=confirmation.created_at,
        updated_at=confirmation.updated_at,
        updated_sequence=confirmation.updated_sequence,
    )


def confirmation_to_domain(record: ConfirmationRecord) -> Confirmation:
    return Confirmation(
        id=record.id,
        session_id=record.session_id,
        run_id=record.run_id,
        tool_call_id=record.tool_call_id,
        workspace_id=record.workspace_id,
        name=record.name,
        arguments=record.arguments,
        summary=record.summary,
        side_effect=record.side_effect,
        execution=record.execution,
        binding=record.binding,
        status=ConfirmationStatus(record.status),
        decided_at=as_utc(record.decided_at) if record.decided_at is not None else None,
        created_at=as_utc(record.created_at),
        updated_at=as_utc(record.updated_at),
        updated_sequence=record.updated_sequence,
    )
