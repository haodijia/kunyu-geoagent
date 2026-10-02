"""Prompt, tool, approval and durable turn services."""

from kunyu.agent import services as s
from kunyu.agent.context import RunContextNotFoundError, register_system_prompt
from kunyu.agent.runtime.context import (
    ContextPreparationRegistry,
    PromptSectionRegistry,
)
from kunyu.agent.scope import AgentScopes, Context
from kunyu.agent.tools.registry import ToolPolicyGate, ToolRegistryFactory
from kunyu.application.confirmations import ConfirmationService
from kunyu.application.run_acceptance import RunAcceptanceService
from kunyu.application.run_lifecycle import RunLifecycleService
from kunyu.persistence.run_acceptance import SQLAlchemyRunAcceptanceRepository


class ScopePlugin:
    name = "agent-scopes"
    requires = ()
    provides = (s.SCOPES,)

    async def apply(self, context: Context) -> None:
        context.provide(s.SCOPES, AgentScopes(context))


class PromptPlugin:
    name = "system-prompt"
    requires = ()
    provides = (s.PROMPTS, s.CONTEXT_PREPARERS)

    async def apply(self, context: Context) -> None:
        registry = PromptSectionRegistry()
        register_system_prompt(context, registry)
        context.provide(s.PROMPTS, registry)
        context.provide(s.CONTEXT_PREPARERS, ContextPreparationRegistry())


class ToolsPlugin:
    name = "tools"
    requires = (s.CONTEXTS, s.SCOPES, s.DATABASE)
    provides = (s.TOOLS, s.POLICY)

    async def apply(self, context: Context) -> None:
        repository = context.require(s.CONTEXTS)

        def resolve_scope(run_id: str) -> Context:
            source = repository.get(run_id)
            if source is None:
                raise RunContextNotFoundError(run_id)
            return context.require(s.SCOPES).for_session(source.session.id)

        registry = ToolRegistryFactory(resolve_scope)
        context.provide(s.TOOLS, registry)
        context.provide(
            s.POLICY, ToolPolicyGate(registry, context.require(s.DATABASE), repository)
        )


class TurnServicesPlugin:
    name = "turn-services"
    requires = (
        s.DATABASE,
        s.CONNECTIONS,
        s.CONNECTION_LOCKS,
        s.EVENTS,
        s.LIFECYCLE_REPOSITORY,
        s.TOOLS,
        s.POLICY,
    )
    provides = (s.CONFIRMATIONS, s.ACCEPTANCE, s.LIFECYCLE)

    async def apply(self, context: Context) -> None:
        database = context.require(s.DATABASE)
        context.provide(
            s.CONFIRMATIONS,
            ConfirmationService(
                database, context.require(s.TOOLS), context.require(s.POLICY)
            ),
        )
        context.provide(
            s.ACCEPTANCE,
            RunAcceptanceService(
                SQLAlchemyRunAcceptanceRepository(database),
                context.require(s.CONNECTIONS),
                context.require(s.CONNECTION_LOCKS),
            ),
        )
        context.provide(
            s.LIFECYCLE,
            RunLifecycleService(
                context.require(s.LIFECYCLE_REPOSITORY), context.require(s.EVENTS)
            ),
        )
