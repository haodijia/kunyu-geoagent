"""Cross-session delegation facts must agree with the child's journal."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from kunyu.agent.runtime.events import ModelSnapshotPayload
from kunyu.agent.runtime.session_reducer import reduce_session
from kunyu.agent.runtime.session_state import ReducedSession
from kunyu.domain.runs import ProjectionConflictError
from kunyu.persistence.models import SessionEventRecord, SessionRecord
from kunyu.persistence.run_records import event_to_domain


def validate_subagent_receipts(transaction: Session, parent: ReducedSession) -> None:
    if not parent.subagents:
        return
    owner = transaction.get(SessionRecord, parent.session_id)
    if owner is None:
        raise ProjectionConflictError("Delegation parent session is missing.")
    for delegation in parent.subagents:
        created = delegation.created
        target = transaction.get(SessionRecord, created.child_session_id)
        if target is None or target.workspace_id != owner.workspace_id:
            raise ProjectionConflictError("Delegation crosses workspace ownership.")
        records = tuple(
            event_to_domain(record)
            for record in transaction.scalars(
                select(SessionEventRecord)
                .where(SessionEventRecord.session_id == created.child_session_id)
                .order_by(SessionEventRecord.sequence)
            )
        )
        child = reduce_session(records)
        births = [
            message
            for event in records
            if event.event_type == "agent/inbox/spliced"
            and event.payload["target"] == "next-turn"
            for message in event.payload["messages"]
            if message["turn"] is not None
            and message["turn"]["run_id"] == created.child_run_id
        ]
        if (
            len(births) != 1
            or births[0]["content"] != created.prompt
            or ModelSnapshotPayload.model_validate(births[0]["turn"]["model_snapshot"])
            != created.model_snapshot
            or child.controls.permission != created.permission
            or child.subagents
        ):
            raise ProjectionConflictError(
                "Delegation differs from its child input receipt."
            )
        settled = delegation.settled
        if settled is None:
            continue
        run = next(
            (run for run in child.runs if run.run_id == created.child_run_id), None
        )
        output = ""
        if run is None:
            discarded = any(
                message.message_id == births[0]["message_id"] and message.discarded
                for message in child.user_messages
            )
            if not discarded or settled.status != "cancelled":
                raise ProjectionConflictError(
                    "Unstarted children require a discarded input."
                )
        else:
            if run.state.value != settled.status:
                raise ProjectionConflictError(
                    "Delegation outcome differs from its child run."
                )
            if delegation.settled_at is None or delegation.settled_at < run.updated_at:
                raise ProjectionConflictError(
                    "Delegation settlement precedes its child stop."
                )
            output = next(
                (
                    message.content
                    for message in reversed(run.assistants)
                    if message.content
                ),
                "",
            )
        if settled.output != output:
            raise ProjectionConflictError(
                "Delegation output differs from its child response."
            )
