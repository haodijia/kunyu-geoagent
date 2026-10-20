"""Register the complete ORM metadata; import record classes from their owner modules."""

from kunyu.persistence.records import (
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
    "conversation",
    "execution",
    "geospatial",
    "jobs",
    "mcp",
    "models",
    "oge",
    "workspaces",
]
