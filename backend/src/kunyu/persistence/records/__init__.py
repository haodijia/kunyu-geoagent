"""Register the complete ORM metadata; import record classes from their owner modules."""

from kunyu.persistence.records import (
    conversation,
    execution,
    geospatial,
    mcp,
    models,
    oge,
    workspaces,
)

__all__ = [
    "conversation",
    "execution",
    "geospatial",
    "mcp",
    "models",
    "oge",
    "workspaces",
]
