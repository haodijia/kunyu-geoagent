"""Business-independent contracts and lifecycle for the agent runtime."""

from dsh.context import AgentContext, ContextProvider, Memory
from dsh.events import (
    ALLOWED_RUN_TRANSITIONS,
    TERMINAL_RUN_STATES,
    AgentEvent,
    EventBatch,
    EventDraft,
    EventStore,
    ResumePhase,
    RunState,
)
from dsh.host import Capability, Host, HostError, Plugin
from dsh.models import (
    ModelAdapter,
    ModelAdapterError,
    ModelErrorCode,
    ModelFinish,
    ModelFinishReason,
    ModelMessage,
    ModelOutput,
    ModelRequest,
    ModelRole,
    ModelToolCall,
    TextDelta,
    TokenUsage,
)
from dsh.reducer import reduce_run
from dsh.run_state import (
    ReducedAssistant,
    ReducedBudget,
    ReducedRun,
    ReducedToolCall,
    RunReductionError,
)
from dsh.runtime import AgentRuntime
from dsh.tools import PolicyDecision, PolicyGate, Tool, ToolCall, ToolResult, ToolSpec

__all__ = [
    "ALLOWED_RUN_TRANSITIONS",
    "TERMINAL_RUN_STATES",
    "AgentContext",
    "AgentEvent",
    "AgentRuntime",
    "Capability",
    "ContextProvider",
    "EventBatch",
    "EventDraft",
    "EventStore",
    "Host",
    "HostError",
    "Memory",
    "ModelAdapter",
    "ModelAdapterError",
    "ModelErrorCode",
    "ModelFinish",
    "ModelFinishReason",
    "ModelMessage",
    "ModelOutput",
    "ModelRequest",
    "ModelRole",
    "ModelToolCall",
    "Plugin",
    "PolicyDecision",
    "PolicyGate",
    "ReducedAssistant",
    "ReducedBudget",
    "ReducedRun",
    "ReducedToolCall",
    "ResumePhase",
    "RunReductionError",
    "RunState",
    "TextDelta",
    "TokenUsage",
    "Tool",
    "ToolCall",
    "ToolResult",
    "ToolSpec",
    "reduce_run",
]
