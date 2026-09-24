from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True, slots=True)
class AgentEvent:
    id: str
    session_id: str
    sequence: int
    event_type: str
    payload: dict[str, Any]
    occurred_at: datetime
