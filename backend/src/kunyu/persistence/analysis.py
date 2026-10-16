"""Session job intents and workspace-owned outputs with source-session provenance."""

import time
from datetime import UTC, datetime
from uuid import uuid4

from pydantic import JsonValue
from sqlalchemy import select, text

from kunyu.domain.analysis import (
    EXECUTING_STATES,
    AnalysisError,
    AnalysisJob,
    AnalysisOutput,
)
from kunyu.persistence.analysis_models import AnalysisJobRecord, AnalysisOutputRecord
from kunyu.persistence.analysis_shared import publish, require_session, require_workspace
from kunyu.persistence.database import Database
from kunyu.persistence.time import as_utc


class AnalysisRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def jobs(self, session_id: str) -> list[AnalysisJob]:
        with self.database.sessions() as tx:
            require_session(tx, session_id)
            return [
                job_value(row)
                for row in tx.scalars(
                    select(AnalysisJobRecord)
                    .where(AnalysisJobRecord.session_id == session_id)
                    .order_by(AnalysisJobRecord.created_at.desc())
                )
            ]

    def job(self, session_id: str, job_id: str) -> AnalysisJob:
        with self.database.sessions() as tx:
            require_session(tx, session_id)
            row = tx.get(AnalysisJobRecord, job_id)
            if row is None or row.session_id != session_id:
                raise AnalysisError("NOT_FOUND", "Analysis job was not found.", 404)
            return job_value(row)

    def create(
        self,
        session_id: str,
        run_id: str | None,
        tool_call_id: str,
        mode: str,
        subject: str | None,
        base_url: str | None,
        parameters: dict[str, JsonValue],
    ) -> tuple[AnalysisJob, bool]:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            session = require_session(tx, session_id, writable=True)
            existing = tx.scalar(
                select(AnalysisJobRecord).where(
                    AnalysisJobRecord.session_id == session_id,
                    AnalysisJobRecord.tool_call_id == tool_call_id,
                )
            )
            if existing is not None:
                return job_value(existing), False
            now = datetime.now(UTC)
            row = AnalysisJobRecord(
                id=f"job_{uuid4()}",
                session_id=session_id,
                workspace_id=session.workspace_id,
                run_id=run_id,
                tool_call_id=tool_call_id,
                mode=mode,
                service="execute_code",
                state="submitting",
                query_state="ready",
                remote_id=None,
                account_subject=subject,
                account_base_url=base_url,
                parameters=parameters,
                revision=1,
                next_poll_at=time.time(),
                created_at=now,
                updated_at=now,
                error_code=None,
                error_message=None,
            )
            tx.add(row)
            tx.flush()
            publish(self.database, tx, session_id, "analysis/job", row.id, 1, row.state)
            return job_value(row), True

    def change(self, job_id: str, **changes) -> AnalysisJob:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            row = tx.get(AnalysisJobRecord, job_id)
            if row is None:
                raise AnalysisError("NOT_FOUND", "Analysis job was not found.", 404)
            for key, value in changes.items():
                if key not in {
                    "state",
                    "query_state",
                    "remote_id",
                    "error_code",
                    "error_message",
                    "next_poll_at",
                    "parameters",
                }:
                    raise ValueError("Unsupported analysis job mutation.")
                setattr(row, key, value)
            row.revision += 1
            row.updated_at = datetime.now(UTC)
            tx.flush()
            publish(
                self.database,
                tx,
                row.session_id,
                "analysis/job",
                row.id,
                row.revision,
                row.state,
            )
            return job_value(row)

    def due(self) -> list[tuple[AnalysisJob, str | None, str | None]]:
        with self.database.sessions() as tx:
            rows = tx.scalars(
                select(AnalysisJobRecord)
                .where(
                    AnalysisJobRecord.state.in_(EXECUTING_STATES[1:]),
                    AnalysisJobRecord.next_poll_at <= time.time(),
                )
                .order_by(AnalysisJobRecord.next_poll_at)
                .limit(4)
            )
            return [
                (job_value(row), row.account_subject, row.account_base_url)
                for row in rows
            ]

    def recover(self) -> None:
        with self.database.sessions() as tx:
            ids = list(
                tx.scalars(
                    select(AnalysisJobRecord.id).where(
                        AnalysisJobRecord.state == "submitting"
                    )
                )
            )
        for job_id in ids:
            self.change(
                job_id,
                state="submission_unknown",
                error_code="SUBMISSION_UNKNOWN",
                error_message="The app stopped before the submission response was saved; the remote call will not be repeated.",
            )

    def workspace_outputs(self, workspace_id: str) -> list[AnalysisOutput]:
        with self.database.sessions() as tx:
            require_workspace(tx, workspace_id)
            return [
                output_value(row)
                for row in tx.scalars(
                    select(AnalysisOutputRecord)
                    .where(AnalysisOutputRecord.workspace_id == workspace_id)
                    .order_by(AnalysisOutputRecord.created_at.desc(), AnalysisOutputRecord.id)
                )
            ]

    def workspace_output(self, workspace_id: str, output_id: str) -> AnalysisOutput:
        with self.database.sessions() as tx:
            require_workspace(tx, workspace_id)
            row = tx.get(AnalysisOutputRecord, output_id)
            if row is None or row.workspace_id != workspace_id:
                raise AnalysisError("NOT_FOUND", "Analysis output was not found.", 404)
            return output_value(row)

    def output(self, session_id: str, output_id: str) -> AnalysisOutput:
        with self.database.sessions() as tx:
            session = require_session(tx, session_id)
            return self.workspace_output(session.workspace_id, output_id)

    def output_for_job(self, session_id: str, job_id: str) -> AnalysisOutput:
        with self.database.sessions() as tx:
            require_session(tx, session_id)
            row = tx.scalar(
                select(AnalysisOutputRecord).where(
                    AnalysisOutputRecord.session_id == session_id,
                    AnalysisOutputRecord.job_id == job_id,
                )
            )
            if row is None:
                raise AnalysisError(
                    "ANALYSIS_OUTPUT_MISSING",
                    f"Analysis job {job_id} has no prepared output.",
                )
            return output_value(row)

    def files(self, workspace_id: str, output_id: str) -> tuple[str, str]:
        with self.database.sessions() as tx:
            require_workspace(tx, workspace_id)
            row = tx.get(AnalysisOutputRecord, output_id)
            if row is None or row.workspace_id != workspace_id:
                raise AnalysisError("NOT_FOUND", "Analysis output was not found.", 404)
            return row.cog_file, row.preview_file

    def publish_output(
        self,
        job: AnalysisJob,
        output_id: str,
        metadata: dict,
        source_metadata: dict,
        cog_file: str,
        preview_file: str,
        original_status: int,
    ) -> AnalysisOutput:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            existing = tx.scalar(
                select(AnalysisOutputRecord).where(
                    AnalysisOutputRecord.job_id == job.id
                )
            )
            if existing is not None:
                return output_value(existing)
            source_session = require_session(tx, job.session_id)
            row = AnalysisOutputRecord(
                id=output_id,
                job_id=job.id,
                session_id=job.session_id,
                workspace_id=job.workspace_id,
                source_session_title=source_session.title,
                title=str(job.parameters["title"]),
                mode=job.mode,
                kind="scalar_raster" if metadata["bands"] == 1 else "rgb_raster",
                raster_metadata=metadata,
                source_metadata={
                    **source_metadata,
                    "origin": {
                        "session_id": job.session_id,
                        "job_id": job.id,
                        "run_id": job.run_id,
                        "tool_call_id": job.tool_call_id,
                    },
                },
                bounds=metadata["bounds"],
                cog_file=cog_file,
                preview_file=preview_file,
                original_status=original_status,
                revision=1,
                created_at=datetime.now(UTC),
            )
            tx.add(row)
            tx.flush()
            publish(self.database, tx, job.session_id, "analysis/output", row.id, 1)
            return output_value(row)


def job_value(row: AnalysisJobRecord) -> AnalysisJob:
    value = AnalysisJob.model_validate(row)
    return value.model_copy(
        update={
            "created_at": as_utc(row.created_at),
            "updated_at": as_utc(row.updated_at),
        }
    )


def output_value(row: AnalysisOutputRecord) -> AnalysisOutput:
    return AnalysisOutput(
        id=row.id,
        job_id=row.job_id,
        workspace_id=row.workspace_id,
        session_id=row.session_id,
        source_session_title=row.source_session_title,
        title=row.title,
        mode=row.mode,
        kind=row.kind,
        metadata=row.raster_metadata,
        source_metadata=row.source_metadata,
        bounds=tuple(row.bounds),
        original_status=row.original_status,
        revision=row.revision,
        created_at=as_utc(row.created_at),
    )
