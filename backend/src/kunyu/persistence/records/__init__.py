"""Register the complete ORM metadata; import record classes from their owner modules."""

from kunyu.persistence.records import (
    assessments,
    conversation,
    execution,
    geospatial,
    jobs,
    mcp,
    models,
    oge,
    workspaces,
)

__all__ = [
    "assessments",
    "conversation",
    "execution",
    "geospatial",
    "jobs",
    "mcp",
    "models",
    "oge",
    "workspaces",
]
