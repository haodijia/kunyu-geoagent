"""Refuse desktop storage migration while persistent work is active."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.domain.execution.runs import NONTERMINAL_RUN_STATE_VALUES
from kunyu.persistence.database import Database
from kunyu.persistence.records.execution import RunRecord
from kunyu.persistence.records.jobs import BackgroundJobRecord

router = APIRouter(prefix="/api/v1/storage", tags=["storage"])


@router.get("/migration-check")
def migration_check(database: Annotated[Database, Depends(get_database)]):
    with database.sessions() as tx:
        active_run = tx.scalar(
            select(RunRecord.id)
            .where(RunRecord.state.in_(NONTERMINAL_RUN_STATE_VALUES))
            .limit(1)
        )
        active_job = tx.scalar(
            select(BackgroundJobRecord.id)
            .where(
                BackgroundJobRecord.snapshot["status"]
                .as_string()
                .in_(("running", "stopping"))
            )
            .limit(1)
        )
        if active_run is not None or active_job is not None:
            raise ApiError(
                409,
                "ACTIVE_TASKS",
                "Finish or stop active tasks before migrating business data.",
            )
    return {"ready": True}
