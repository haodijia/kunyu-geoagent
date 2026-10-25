"""Aggregate persisted run counters once per workspace, never replay UI events."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, select

from kunyu.domain.workspaces.overview import (
    ActivityDay,
    MemoryItem,
    WorkspaceMetrics,
    WorkspaceOverviewData,
)
from kunyu.persistence.database import Database
from kunyu.persistence.records.conversation import SessionRecord
from kunyu.persistence.records.execution import RunRecord
from kunyu.persistence.records.workspaces import WorkspaceMemoryRecord


class WorkspaceOverviewRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def read(self, workspace_id: str) -> WorkspaceOverviewData:
        today = datetime.now(UTC).date()
        start = today - timedelta(days=6)
        with self.database.sessions() as tx:
            scope = select(SessionRecord.id).where(
                SessionRecord.workspace_id == workspace_id
            )
            states = ("completed", "failed", "cancelled")
            totals = tx.execute(
                select(
                    func.count(RunRecord.id),
                    *(
                        func.sum(case((RunRecord.state == state, 1), else_=0))
                        for state in states
                    ),
                    func.sum(RunRecord.model_calls),
                    func.sum(RunRecord.tool_calls),
                    func.sum(RunRecord.total_tokens),
                    func.count(RunRecord.total_tokens),
                ).where(RunRecord.session_id.in_(scope))
            ).one()
            runs, completed, failed, cancelled, models, tools, tokens, reported = totals
            completed, failed, cancelled = completed or 0, failed or 0, cancelled or 0
            daily = tx.execute(
                select(
                    func.date(RunRecord.created_at),
                    func.count(RunRecord.id),
                    func.sum(case((RunRecord.state == "completed", 1), else_=0)),
                )
                .where(
                    RunRecord.session_id.in_(scope),
                    RunRecord.created_at
                    >= datetime.combine(start, datetime.min.time(), UTC),
                )
                .group_by(func.date(RunRecord.created_at))
            ).all()
            days = {day: (count, done) for day, count, done in daily}
            memories = tx.scalars(
                select(WorkspaceMemoryRecord)
                .where(WorkspaceMemoryRecord.workspace_id == workspace_id)
                .order_by(
                    WorkspaceMemoryRecord.created_at.desc(),
                    WorkspaceMemoryRecord.id.desc(),
                )
                .limit(100)
            ).all()
            return WorkspaceOverviewData(
                metrics=WorkspaceMetrics(
                    sessions=tx.scalar(
                        select(func.count()).select_from(scope.subquery())
                    )
                    or 0,
                    runs=runs,
                    completed=completed,
                    failed=failed,
                    cancelled=cancelled,
                    active=runs - completed - failed - cancelled,
                    model_calls=models or 0,
                    tool_calls=tools or 0,
                    total_tokens=tokens,
                    token_reported_runs=reported,
                    activity=[
                        ActivityDay(
                            day=day,
                            runs=days.get(day.isoformat(), (0, 0))[0],
                            completed=days.get(day.isoformat(), (0, 0))[1],
                        )
                        for day in (start + timedelta(days=index) for index in range(7))
                    ],
                ),
                memories=[
                    MemoryItem(
                        id=row.id, content=row.content, created_at=row.created_at
                    )
                    for row in memories
                ],
                memory_count=tx.scalar(
                    select(func.count())
                    .select_from(WorkspaceMemoryRecord)
                    .where(WorkspaceMemoryRecord.workspace_id == workspace_id)
                )
                or 0,
            )
