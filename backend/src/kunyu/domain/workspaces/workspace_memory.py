from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True, slots=True)
class WorkspaceMemory:
    id: str
    workspace_id: str
    content: str
    source_tool_call_id: str
    created_at: datetime

    def __post_init__(self) -> None:
        if not self.id or len(self.id) > 64:
            raise ValueError("Workspace memory ID must contain at most 64 characters.")
        if not self.workspace_id or len(self.workspace_id) > 64:
            raise ValueError("Workspace ID must contain at most 64 characters.")
        if not self.source_tool_call_id or len(self.source_tool_call_id) > 64:
            raise ValueError("Source tool call ID must contain at most 64 characters.")
        if self.content != self.content.strip() or not self.content:
            raise ValueError(
                "Workspace memory content must be normalized and non-empty."
            )
        if len(self.content) > 2_000:
            raise ValueError(
                "Workspace memory content must not exceed 2,000 characters."
            )


@dataclass(frozen=True, slots=True)
class WorkspaceMemoryPage:
    items: tuple[WorkspaceMemory, ...]
    total_count: int

    def __post_init__(self) -> None:
        if self.total_count < len(self.items):
            raise ValueError("Memory total count cannot be smaller than its page.")


class WorkspaceMemoryWorkspaceNotFoundError(LookupError):
    def __init__(self, workspace_id: str) -> None:
        self.workspace_id = workspace_id
        super().__init__(f"Workspace '{workspace_id}' was not found.")


class WorkspaceMemoryRepository(Protocol):
    def read(
        self, workspace_id: str, query: str, limit: int
    ) -> WorkspaceMemoryPage: ...
