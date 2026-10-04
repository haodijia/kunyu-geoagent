"""Select plan mode without changing permissions within a tool batch."""

from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select, text

from kunyu.agent.runtime.events import (
    EventBatch,
    PlanChangedEvent,
    PlanChangedPayload,
    PlanSelectedEvent,
)
from kunyu.domain.runs import NONTERMINAL_RUN_STATE_VALUES
from kunyu.persistence.agent_projections import SQLAlchemyAgentProjectionService
from kunyu.persistence.commands import session_controls
from kunyu.persistence.database import Database
from kunyu.persistence.models import RunRecord


def select_plan_mode(
    database: Database,
    projections: SQLAlchemyAgentProjectionService,
    session_id: str,
    active: bool,
) -> Literal["committed", "queued", "cancelled", "noop"]:
    with database.sessions() as transaction:
        transaction.execute(text("BEGIN IMMEDIATE"))
        state = session_controls(transaction, session_id)
        target = state.plan_active if state.plan_pending is None else state.plan_pending
        if active == target:
            return "noop"
        open_turn = (
            transaction.scalar(
                select(RunRecord.id)
                .where(
                    RunRecord.session_id == session_id,
                    RunRecord.state.in_(NONTERMINAL_RUN_STATE_VALUES),
                )
                .limit(1)
            )
            is not None
        )
        event = (PlanSelectedEvent if open_turn else PlanChangedEvent)(
            session_id=session_id,
            event_type="plan/selected" if open_turn else "plan/changed",
            payload=PlanChangedPayload(active=active),
            occurred_at=datetime.now(UTC),
        )
        projections.commit_in_transaction(
            transaction, EventBatch(session_id, None, (event,))
        )
        transaction.commit()
        if active == state.plan_active:
            return "cancelled"
        return "queued" if open_turn else "committed"
