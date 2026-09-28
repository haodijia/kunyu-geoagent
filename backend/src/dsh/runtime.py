"""Driver boundary for accepted runs."""

from typing import Protocol


class AgentRuntime(Protocol):
    async def run(self, run_id: str) -> None: ...

    async def cancel(self, run_id: str) -> None: ...
