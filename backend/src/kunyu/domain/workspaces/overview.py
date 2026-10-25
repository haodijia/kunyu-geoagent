"""Workspace dashboard read models, independent of transport and storage."""

from datetime import date, datetime

from pydantic import BaseModel


class ActivityDay(BaseModel):
    day: date
    runs: int
    completed: int


class WorkspaceMetrics(BaseModel):
    sessions: int
    runs: int
    completed: int
    failed: int
    active: int
    cancelled: int
    model_calls: int
    tool_calls: int
    total_tokens: int | None
    token_reported_runs: int
    activity: list[ActivityDay]


class MemoryItem(BaseModel):
    id: str
    content: str
    created_at: datetime


class WorkspaceOverviewData(BaseModel):
    metrics: WorkspaceMetrics
    memories: list[MemoryItem]
    memory_count: int
