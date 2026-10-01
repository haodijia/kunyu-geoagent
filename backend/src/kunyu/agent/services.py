"""Typed service keys shared by composition and extension plugins."""

from __future__ import annotations

from typing import TYPE_CHECKING

from kunyu.agent.scope import AgentScopes, ServiceKey

if TYPE_CHECKING:
    import httpx

    from kunyu.agent.adapters import StoredRunExecutionProvider
    from kunyu.agent.runtime.context import PromptSectionRegistry
    from kunyu.agent.runtime.driver import AgentRuntime
    from kunyu.agent.runtime.models import ModelAdapter
    from kunyu.agent.runtime.runner import Runner
    from kunyu.agent.scheduler import RunScheduler
    from kunyu.agent.session_agent import AgentDirectory, SessionAgent
    from kunyu.agent.skills.registry import SkillRegistry
    from kunyu.agent.tools.registry import ToolPolicyGate, ToolRegistryFactory
    from kunyu.application.confirmations import ConfirmationService
    from kunyu.application.connection_locks import ConnectionOperationLocks
    from kunyu.application.run_acceptance import RunAcceptanceService
    from kunyu.application.run_lifecycle import RunLifecycleService
    from kunyu.persistence.agent_context import SQLAlchemyRunContextRepository
    from kunyu.persistence.agent_projections import SQLAlchemyAgentProjectionService
    from kunyu.persistence.database import Database
    from kunyu.persistence.model_connections import SQLAlchemyModelConnectionRepository
    from kunyu.persistence.run_lifecycle import SQLAlchemyRunLifecycleRepository
    from kunyu.persistence.runs import SQLAlchemyEventStore
    from kunyu.persistence.workspace_memory import SQLAlchemyWorkspaceMemoryRepository

DATABASE: ServiceKey[Database] = ServiceKey("database")
SCOPES: ServiceKey[AgentScopes] = ServiceKey("agent_scopes")
HTTP_CLIENT: ServiceKey[httpx.AsyncClient] = ServiceKey("http_client")
CONNECTION_LOCKS: ServiceKey[ConnectionOperationLocks] = ServiceKey("connection_locks")
EVENTS: ServiceKey[SQLAlchemyEventStore] = ServiceKey("sessions.events")
CONNECTIONS: ServiceKey[SQLAlchemyModelConnectionRepository] = ServiceKey(
    "model.connections"
)
CONTEXTS: ServiceKey[SQLAlchemyRunContextRepository] = ServiceKey("sessions.contexts")
MEMORIES: ServiceKey[SQLAlchemyWorkspaceMemoryRepository] = ServiceKey(
    "workspace.memories"
)
PROJECTIONS: ServiceKey[SQLAlchemyAgentProjectionService] = ServiceKey(
    "sessions.projections"
)
EXECUTIONS: ServiceKey[StoredRunExecutionProvider] = ServiceKey("loop.executions")
LIFECYCLE_REPOSITORY: ServiceKey[SQLAlchemyRunLifecycleRepository] = ServiceKey(
    "turns.repository"
)
MODEL: ServiceKey[ModelAdapter] = ServiceKey("model")
PROMPTS: ServiceKey[PromptSectionRegistry] = ServiceKey("system_prompt")
TOOLS: ServiceKey[ToolRegistryFactory] = ServiceKey("tools")
POLICY: ServiceKey[ToolPolicyGate] = ServiceKey("tools.policy")
CONFIRMATIONS: ServiceKey[ConfirmationService] = ServiceKey("approval")
ACCEPTANCE: ServiceKey[RunAcceptanceService] = ServiceKey("turns.acceptance")
LIFECYCLE: ServiceKey[RunLifecycleService] = ServiceKey("turns.lifecycle")
RUNTIME: ServiceKey[AgentRuntime] = ServiceKey("agent_loop")
SCHEDULER: ServiceKey[RunScheduler] = ServiceKey("agent_loop.scheduler")
AGENTS: ServiceKey[AgentDirectory] = ServiceKey("agents")
SESSION_AGENT: ServiceKey[SessionAgent] = ServiceKey("agent")
SESSION_ID: ServiceKey[str] = ServiceKey("session_id")
RUN_ID: ServiceKey[str] = ServiceKey("run_id")
RUNNER: ServiceKey[Runner] = ServiceKey("runner")
SKILLS: ServiceKey[SkillRegistry] = ServiceKey("skills")
