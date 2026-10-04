"""Read complete, immutable plans from logged tool requests."""

from sqlalchemy import select

from kunyu.domain.plans import SubmittedPlan, plan_title
from kunyu.persistence.database import Database
from kunyu.persistence.models import SessionEventRecord, SessionRecord


class PlanNotFoundError(LookupError):
    pass


def read_submitted_plan(
    database: Database, session_id: str, tool_call_id: str
) -> SubmittedPlan:
    with database.sessions() as transaction:
        if transaction.get(SessionRecord, session_id) is None:
            raise PlanNotFoundError("Session not found.")
        payload = transaction.scalar(
            select(SessionEventRecord.payload).where(
                SessionEventRecord.session_id == session_id,
                SessionEventRecord.event_type == "tool.requested",
                SessionEventRecord.payload["tool_call_id"].as_string() == tool_call_id,
                SessionEventRecord.payload["name"].as_string() == "exit_plan_mode",
            )
        )
        if payload is None or not isinstance(payload["arguments"].get("plan"), str):
            raise PlanNotFoundError("Submitted plan not found.")
        markdown = payload["arguments"]["plan"]
        try:
            title = plan_title(markdown)
        except ValueError as error:
            raise PlanNotFoundError(
                "Submitted plan has no valid Markdown heading."
            ) from error
        return SubmittedPlan(tool_call_id, title, markdown)
