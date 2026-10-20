"""One persistent job query source, with complete workspace log artifacts."""

import codecs
import json
from datetime import UTC, datetime
from pathlib import Path

from pydantic import JsonValue
from sqlalchemy import select, text

from kunyu.agent.runtime.events.session import JobChangedEvent, JobChangedPayload
from kunyu.agent.runtime.events.store import EventBatch
from kunyu.domain.execution.jobs import (
    TERMINAL_JOB_STATES,
    JobNotFoundError,
    JobSnapshot,
)
from kunyu.persistence.database import Database
from kunyu.persistence.execution.agent_projections import (
    SQLAlchemyAgentProjectionService,
)
from kunyu.persistence.geospatial.analysis_shared import require_session
from kunyu.persistence.records.execution import ToolCallRecord
from kunyu.persistence.records.jobs import BackgroundJobRecord


class SQLAlchemyJobStore:
    def __init__(self, database: Database) -> None:
        self.database = database
        self._projections = SQLAlchemyAgentProjectionService(database)

    def create(self, owner: str, view: JobSnapshot) -> tuple[JobSnapshot, bool]:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            session = require_session(tx, owner, writable=True)
            previous = tx.scalar(
                select(BackgroundJobRecord).where(
                    BackgroundJobRecord.session_id == owner,
                    BackgroundJobRecord.tool_call_id == view.tool_call_id,
                )
            )
            if previous is not None:
                existing = JobSnapshot.model_validate(previous.snapshot)
                if (existing.owner_run_id, existing.kind) != (
                    view.owner_run_id,
                    view.kind,
                ):
                    raise ValueError("Job identity belongs to another execution.")
                return existing, False
            call = tx.get(ToolCallRecord, view.tool_call_id)
            if (
                call is None
                or call.session_id != owner
                or call.run_id != view.owner_run_id
            ):
                raise ValueError("A job must belong to its originating tool call.")
            log = self._path(session.workspace_id, view.id, "output.log")
            log.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            log.touch(mode=0o600, exist_ok=False)
            try:
                tx.add(
                    BackgroundJobRecord(
                        id=view.id,
                        session_id=owner,
                        workspace_id=session.workspace_id,
                        tool_call_id=view.tool_call_id,
                        snapshot=view.model_dump(mode="json"),
                        result=None,
                        model_cursor=0,
                        result_delivered=False,
                    )
                )
                self._publish(tx, owner, view)
            except BaseException:
                log.unlink()
                raise
        return view, True

    def get(self, job_id: str, owner: str) -> JobSnapshot:
        with self.database.sessions() as tx:
            return JobSnapshot.model_validate(self._require(tx, job_id, owner).snapshot)

    def list(self, owner: str | None = None) -> list[tuple[str, JobSnapshot]]:
        with self.database.sessions() as tx:
            statement = select(BackgroundJobRecord).order_by(BackgroundJobRecord.id)
            if owner is not None:
                require_session(tx, owner)
                statement = statement.where(BackgroundJobRecord.session_id == owner)
            return [
                (row.session_id, JobSnapshot.model_validate(row.snapshot))
                for row in tx.scalars(statement)
            ]

    def change(
        self, owner: str, view: JobSnapshot, *, result: JsonValue = None
    ) -> JobSnapshot:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            row = self._require(tx, view.id, owner)
            current = JobSnapshot.model_validate(row.snapshot)
            if current.status in TERMINAL_JOB_STATES:
                return current
            row.snapshot = view.model_dump(mode="json")
            if view.status == "completed":
                row.result = result
                result_path = self._path(row.workspace_id, view.id, "result.json")
                result_path.write_text(
                    json.dumps(result, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8",
                )
                result_path.chmod(0o600)
            self._publish(tx, owner, view)
        return view

    def append(self, job_id: str, owner: str, value: str) -> None:
        with self.database.sessions() as tx:
            row = self._require(tx, job_id, owner)
            view = JobSnapshot.model_validate(row.snapshot)
            if view.status in TERMINAL_JOB_STATES:
                raise RuntimeError("Cannot append output after job settlement.")
            with self._path(row.workspace_id, job_id, "output.log").open(
                "ab"
            ) as stream:
                stream.write(value.encode("utf-8"))

    def read_at(
        self, job_id: str, owner: str, offset: int, *, limit: int = 256_000
    ) -> dict:
        with self.database.sessions() as tx:
            row = self._require(tx, job_id, owner)
            return self._read(row, offset, limit)

    def read(self, job_id: str, owner: str) -> dict:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            row = self._require(tx, job_id, owner)
            value = self._read(row, row.model_cursor, 8_000)
            if (
                value["job"]["status"] in TERMINAL_JOB_STATES
                and not row.result_delivered
            ):
                result = row.result
                if (
                    value["job"]["status"] == "completed"
                    and len(json.dumps(result, ensure_ascii=False).encode()) <= 5_000
                ):
                    value["result"] = result
                row.result_delivered = True
            # Keep errors and state intact; consume only bytes actually returned to the model.
            text_value = value["text"]
            low, high = 0, len(text_value)
            while low < high:
                middle = (low + high + 1) // 2
                candidate = value | {
                    "text": text_value[:middle],
                    "next_offset": row.model_cursor + len(text_value[:middle].encode()),
                }
                if len(json.dumps(candidate, ensure_ascii=False).encode()) <= 15_000:
                    low = middle
                else:
                    high = middle - 1
            value["text"] = text_value[:low]
            value["next_offset"] = row.model_cursor + len(value["text"].encode("utf-8"))
            row.model_cursor = value["next_offset"]
            return value

    def delivered(self, job_id: str, owner: str) -> bool:
        with self.database.sessions() as tx:
            return self._require(tx, job_id, owner).result_delivered

    def _read(self, row: BackgroundJobRecord, offset: int, limit: int) -> dict:
        path = self._path(row.workspace_id, row.id, "output.log")
        size = path.stat().st_size
        if offset < 0 or offset > size:
            raise ValueError("Invalid background output offset.")
        with path.open("rb") as stream:
            stream.seek(offset)
            data = stream.read(limit)
        text_value = codecs.getincrementaldecoder("utf-8")().decode(data, final=False)
        value = {
            "job": row.snapshot,
            "text": text_value,
            "next_offset": offset + len(text_value.encode("utf-8")),
            "lossy": False,
            "file_path": f"/workspace/.cache/jobs/{row.id}/output.log",
        }
        if row.snapshot["status"] == "completed":
            value["result_file_path"] = f"/workspace/.cache/jobs/{row.id}/result.json"
        return value

    def _path(self, workspace_id: str, job_id: str, name: str) -> Path:
        return (
            self.database.path.parent
            / "workspaces"
            / workspace_id
            / ".cache"
            / "jobs"
            / job_id
            / name
        )

    @staticmethod
    def _require(tx, job_id: str, owner: str) -> BackgroundJobRecord:
        require_session(tx, owner)
        row = tx.get(BackgroundJobRecord, job_id)
        if row is None or row.session_id != owner:
            raise JobNotFoundError("Background job not found in this session.")
        return row

    def _publish(self, tx, owner: str, view: JobSnapshot) -> None:
        self._projections.commit_in_transaction(
            tx,
            EventBatch(
                owner,
                None,
                (
                    JobChangedEvent(
                        session_id=owner,
                        event_type="job/changed",
                        payload=JobChangedPayload.model_validate(
                            view.model_dump(mode="json")
                        ),
                        occurred_at=datetime.now(UTC),
                    ),
                ),
            ),
        )
