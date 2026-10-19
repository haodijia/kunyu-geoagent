"""Analysis tables stay separate from the Agent's rebuildable projections."""

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from kunyu.persistence.records.base import Base


class AnalysisJobRecord(Base):
    __tablename__ = "analysis_jobs"
    __table_args__ = (
        UniqueConstraint("session_id", "tool_call_id", name="uq_analysis_jobs_call"),
        Index("ix_analysis_jobs_due", "state", "next_poll_at"),
        CheckConstraint("mode IN ('replay','live')", name="ck_analysis_jobs_mode"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False
    )
    run_id: Mapped[str | None] = mapped_column(String(64))
    tool_call_id: Mapped[str] = mapped_column(String(64), nullable=False)
    mode: Mapped[str] = mapped_column(String(16), nullable=False)
    service: Mapped[str] = mapped_column(String(32), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    query_state: Mapped[str] = mapped_column(String(32), nullable=False)
    remote_id: Mapped[str | None] = mapped_column(String(100))
    account_subject: Mapped[str | None] = mapped_column(String(200))
    account_base_url: Mapped[str | None] = mapped_column(String(2048))
    parameters: Mapped[dict] = mapped_column(JSON, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    next_poll_at: Mapped[float] = mapped_column(Float, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(100))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class AnalysisOutputRecord(Base):
    __tablename__ = "analysis_outputs"
    __table_args__ = (
        Index("ix_analysis_outputs_workspace_created", "workspace_id", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    job_id: Mapped[str | None] = mapped_column(
        ForeignKey("analysis_jobs.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    session_id: Mapped[str | None] = mapped_column(
        ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True
    )
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False
    )
    source_session_title: Mapped[str] = mapped_column(String(200), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    mode: Mapped[str] = mapped_column(String(16), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    raster_metadata: Mapped[dict] = mapped_column(JSON, nullable=False)
    source_metadata: Mapped[dict] = mapped_column(JSON, nullable=False)
    bounds: Mapped[list] = mapped_column(JSON, nullable=False)
    cog_file: Mapped[str] = mapped_column(String(500), nullable=False)
    preview_file: Mapped[str] = mapped_column(String(500), nullable=False)
    original_status: Mapped[int] = mapped_column(Integer, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class MapLayerRecord(Base):
    __tablename__ = "map_layers"
    __table_args__ = (
        UniqueConstraint("session_id", "output_id", name="uq_map_layers_output"),
        CheckConstraint("opacity >= 0 AND opacity <= 1", name="ck_map_layers_opacity"),
        CheckConstraint(
            "(output_id IS NULL) != (image IS NULL)", name="ck_map_layers_source"
        ),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    output_id: Mapped[str | None] = mapped_column(
        ForeignKey("analysis_outputs.id", ondelete="CASCADE"), nullable=True
    )
    image: Mapped[dict | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    bounds: Mapped[list | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    temporary: Mapped[bool] = mapped_column(Boolean, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    visible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    opacity: Mapped[float] = mapped_column(Float, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
