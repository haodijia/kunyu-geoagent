"""Read authoritative admission results and replay session snapshots."""

from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from kunyu.agent.runtime.projection.session_reducer import reduce_session
from kunyu.agent.runtime.projection.session_state import ReducedSession
from kunyu.domain.conversation.messages import Message, MessageRole, MessageStatus
from kunyu.domain.execution.run_acceptance import (
    RunAcceptanceResult,
)
from kunyu.domain.execution.runs import RunDetails
from kunyu.persistence.conversation.attachments import REFERENCE
from kunyu.persistence.database import Database
from kunyu.persistence.execution import run_records
from kunyu.persistence.records.conversation import (
    MessageRecord,
)
from kunyu.persistence.records.execution import (
    RunModelSnapshotRecord,
    RunRecord,
    SessionEventRecord,
    ToolCallRecord,
)
from kunyu.persistence.time import as_utc


def load_result(
    database: Database, message_id: str, run_id: str
) -> RunAcceptanceResult:
    with database.sessions() as database_session:
        message_record = database_session.get(MessageRecord, message_id)
        run_record = database_session.get(RunRecord, run_id)
        snapshot_record = database_session.get(RunModelSnapshotRecord, run_id)
        if message_record is None:
            raise RuntimeError("Accepted message projection is missing.")
        message = _message_to_domain(message_record)
        if run_record is None:
            if message_record.run_id is not None:
                raise RuntimeError("Accepted turn projection is missing.")
            return RunAcceptanceResult(message=message, run=None)
        if snapshot_record is None:
            raise RuntimeError("Accepted model snapshot is missing.")
        run = run_records.run_to_domain(run_record)
        snapshot = run_records.snapshot_to_domain(snapshot_record)
        tool_records = database_session.scalars(
            select(ToolCallRecord)
            .where(ToolCallRecord.run_id == run_id)
            .order_by(
                ToolCallRecord.step,
                ToolCallRecord.attempt,
                ToolCallRecord.batch_index,
            )
        ).all()
        tool_calls = tuple(
            run_records.tool_call_to_domain(record) for record in tool_records
        )
    return RunAcceptanceResult(
        message=message,
        run=RunDetails(
            run=run,
            model_snapshot=snapshot,
            tool_calls=tool_calls,
        ),
    )


def _message_to_domain(record: MessageRecord) -> Message:
    return Message(
        id=record.id,
        session_id=record.session_id,
        sequence=record.sequence,
        role=cast(MessageRole, record.role),
        content=record.content,
        attachments=tuple(REFERENCE.validate_python(ref) for ref in record.attachments),
        run_id=record.run_id,
        step=record.step,
        attempt=record.attempt,
        status=cast(MessageStatus, record.status),
        content_length=record.content_length,
        updated_sequence=record.updated_sequence,
        created_at=as_utc(record.created_at),
        updated_at=as_utc(record.updated_at),
    )


def _session_state(database_session: Session, session_id: str) -> ReducedSession:
    records = database_session.scalars(
        select(SessionEventRecord)
        .where(SessionEventRecord.session_id == session_id)
        .order_by(SessionEventRecord.sequence)
    ).all()
    return reduce_session(run_records.event_to_domain(record) for record in records)
