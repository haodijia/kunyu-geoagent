"""Generic job state; runtime execution handles are never persisted."""

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from kunyu.persistence.records.base import Base


class BackgroundJobRecord(Base):
    __tablename__ = "background_jobs"
    __table_args__ = (
        UniqueConstraint("session_id", "tool_call_id", name="uq_background_jobs_call"),
        CheckConstraint("model_cursor >= 0", name="ck_background_jobs_cursor"),
    )

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"))
    tool_call_id: Mapped[str] = mapped_column(String(64))
    snapshot: Mapped[dict] = mapped_column(JSON)
    result: Mapped[object | None] = mapped_column(
        JSON(none_as_null=True), nullable=True
    )
    model_cursor: Mapped[int] = mapped_column(Integer)
    result_delivered: Mapped[bool] = mapped_column(Boolean)
