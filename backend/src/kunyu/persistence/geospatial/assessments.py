"""Atomic area revisions and immutable assessment inputs with explicit completion."""

from contextlib import nullcontext

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.assessment import Assessment, StudyArea
from kunyu.persistence.database import Database
from kunyu.persistence.geospatial.analysis_shared import require_workspace
from kunyu.persistence.records.assessments import AssessmentRecord, StudyAreaRecord


class AssessmentRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def area(self, workspace_id: str) -> StudyArea | None:
        with self.database.sessions() as tx:
            require_workspace(tx, workspace_id)
            record = tx.get(StudyAreaRecord, workspace_id)
            return None if record is None else StudyArea.model_validate(record.value)

    def save_area(self, area: StudyArea, expected_revision: int) -> StudyArea:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_workspace(tx, area.workspace_id)
            record = tx.get(StudyAreaRecord, area.workspace_id)
            actual = 0 if record is None else record.revision
            if actual != expected_revision or area.revision != actual + 1:
                raise AnalysisError("AOI_CONFLICT", "研究区已更新，请刷新后重试。", 409)
            tx.merge(
                StudyAreaRecord(
                    workspace_id=area.workspace_id,
                    revision=area.revision,
                    value=area.model_dump(mode="json"),
                )
            )
        return area

    def list(self, workspace_id: str) -> list[Assessment]:
        with self.database.sessions() as tx:
            require_workspace(tx, workspace_id)
            rows = tx.scalars(
                select(AssessmentRecord)
                .where(AssessmentRecord.workspace_id == workspace_id)
                .order_by(AssessmentRecord.created_at.desc())
            )
            return [self._value(row) for row in rows]

    def get(self, workspace_id: str, identity: str) -> Assessment:
        with self.database.sessions() as tx:
            require_workspace(tx, workspace_id)
            row = tx.get(AssessmentRecord, identity)
            if row is None or row.workspace_id != workspace_id:
                raise AnalysisError("NOT_FOUND", "研判记录不存在。", 404)
            return self._value(row)

    def create(self, value: Assessment) -> tuple[Assessment, bool]:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_workspace(tx, value.workspace_id)
            row = tx.get(AssessmentRecord, value.id)
            if row is not None:
                existing = self._value(row)
                if (
                    existing.workspace_id != value.workspace_id
                    or existing.request != value.request
                ):
                    raise AnalysisError(
                        "ASSESSMENT_CONFLICT", "本次请求身份已绑定其他研判。", 409
                    )
                return existing, False
            tx.add(
                AssessmentRecord(
                    id=value.id,
                    workspace_id=value.workspace_id,
                    session_id=value.session_id,
                    value=value.model_dump(mode="json"),
                    created_at=value.created_at,
                )
            )
        return value, True

    def settle(
        self, value: Assessment, *, transaction: Session | None = None
    ) -> Assessment:
        with (
            nullcontext(transaction)
            if transaction is not None
            else self.database.sessions.begin()
        ) as tx:
            if transaction is None:
                tx.execute(text("BEGIN IMMEDIATE"))
            row = tx.get(AssessmentRecord, value.id)
            if row is None or row.workspace_id != value.workspace_id:
                raise AnalysisError("NOT_FOUND", "研判记录不存在。", 404)
            if row.value["status"] != "building":
                return self._value(row)
            row.value = value.model_dump(mode="json")
        return value

    def recover(self) -> None:
        with self.database.sessions.begin() as tx:
            for row in tx.scalars(
                select(AssessmentRecord).where(
                    AssessmentRecord.value["status"].as_string() == "building"
                )
            ):
                row.value = {
                    **row.value,
                    "status": "failed",
                    "error": "应用在生成期间退出；保留输入快照和已有文件，请以新请求重新生成。",
                }

    @staticmethod
    def _value(row: AssessmentRecord) -> Assessment:
        return Assessment.model_validate({**row.value, "session_id": row.session_id})
