"""Close crash-interrupted auxiliary calls without inventing lost output."""

from datetime import UTC, datetime

from sqlalchemy import select

from kunyu.agent.runtime.events import (
    CommandDoneEvent,
    CommandDonePayload,
    CompactionFinishedEvent,
    CompactionFinishedPayload,
    CompactionStartedPayload,
    EventBatch,
)
from kunyu.persistence.agent_projections import SQLAlchemyAgentProjectionService
from kunyu.persistence.database import Database
from kunyu.persistence.models import SessionEventRecord


def recover_compactions(
    database: Database, projections: SQLAlchemyAgentProjectionService
) -> None:
    with database.sessions() as tx:
        records = tx.scalars(
            select(SessionEventRecord)
            .where(
                SessionEventRecord.event_type.in_(
                    ("compaction/start", "compaction/end", "command/done")
                )
            )
            .order_by(SessionEventRecord.session_id, SessionEventRecord.sequence)
        ).all()
        finished = {
            (record.session_id, record.payload["compaction_id"])
            for record in records
            if record.event_type == "compaction/end"
        }
        commands = {
            (record.session_id, record.payload["command_id"])
            for record in records
            if record.event_type == "command/done"
        }
        pending = [
            (record.session_id, CompactionStartedPayload.model_validate(record.payload))
            for record in records
            if record.event_type == "compaction/start"
            and (record.session_id, record.payload["compaction_id"]) not in finished
        ]
    for session_id, payload in pending:
        ended = CompactionFinishedEvent(
            session_id=session_id,
            event_type="compaction/end",
            occurred_at=datetime.now(UTC),
            payload=CompactionFinishedPayload(
                compaction_id=payload.compaction_id,
                outcome="interrupted",
                finish_reason=None,
                error_code="COMPACTION_INTERRUPTED",
                blocks=(),
                stream=(),
                replay_state=None,
                usage=None,
                active_milliseconds=None,
            ),
        )
        done = (
            ()
            if payload.command_id is None
            or (session_id, payload.command_id) in commands
            else (
                CommandDoneEvent(
                    session_id=session_id,
                    event_type="command/done",
                    occurred_at=datetime.now(UTC),
                    payload=CommandDonePayload(
                        command_id=payload.command_id,
                        kind="error",
                        text="压缩已随上次进程中断，原历史保留，请重新执行。",
                    ),
                ),
            )
        )
        projections.commit(EventBatch(session_id, None, (ended, *done)))
