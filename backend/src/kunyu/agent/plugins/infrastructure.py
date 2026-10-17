"""Persistence and model providers for the Agent service contracts."""

from kunyu.agent.context.attachments import RunImageResolver
from kunyu.agent.core import services as s
from kunyu.agent.core.scope import Context
from kunyu.agent.orchestration.adapters import (
    SnapshotCredentialResolver,
    StoredRunExecutionProvider,
)
from kunyu.agent.tools.shared import load_source
from kunyu.integrations.model.adapter import SDKModelAdapter
from kunyu.persistence.conversation.agent_context import SQLAlchemyRunContextRepository
from kunyu.persistence.conversation.attachments import SQLAlchemyAttachmentStore
from kunyu.persistence.execution.agent_projections import (
    SQLAlchemyAgentProjectionService,
)
from kunyu.persistence.execution.run_lifecycle import SQLAlchemyRunLifecycleRepository
from kunyu.persistence.execution.runs import SQLAlchemyEventStore
from kunyu.persistence.models.connections import SQLAlchemyModelConnectionRepository
from kunyu.persistence.workspaces.workspace_memory import (
    SQLAlchemyWorkspaceMemoryRepository,
)


class PersistencePlugin:
    name = "session-persistence"
    requires = (s.DATABASE,)
    provides = (
        s.ATTACHMENTS,
        s.EVENTS,
        s.CONNECTIONS,
        s.CONTEXTS,
        s.MEMORIES,
        s.PROJECTIONS,
        s.EXECUTIONS,
        s.LIFECYCLE_REPOSITORY,
    )

    async def apply(self, context: Context) -> None:
        database = context.require(s.DATABASE)
        events = SQLAlchemyEventStore(database)
        context.provide(s.EVENTS, events)
        context.provide(s.ATTACHMENTS, SQLAlchemyAttachmentStore(database))
        context.provide(s.CONNECTIONS, SQLAlchemyModelConnectionRepository(database))
        context.provide(s.CONTEXTS, SQLAlchemyRunContextRepository(database))
        context.provide(s.MEMORIES, SQLAlchemyWorkspaceMemoryRepository(database))
        context.provide(s.PROJECTIONS, SQLAlchemyAgentProjectionService(database))
        context.provide(s.EXECUTIONS, StoredRunExecutionProvider(events))
        context.provide(
            s.LIFECYCLE_REPOSITORY, SQLAlchemyRunLifecycleRepository(database)
        )


class ModelPlugin:
    name = "llm"
    requires = (
        s.HTTP_CLIENT,
        s.CONNECTIONS,
        s.CONTEXTS,
        s.ATTACHMENTS,
        s.SCOPES,
        s.MODEL_PROVIDERS,
    )
    provides = (s.MODEL,)

    async def apply(self, context: Context) -> None:
        context.provide(
            s.MODEL,
            SDKModelAdapter(
                context.require(s.HTTP_CLIENT),
                context.require(s.MODEL_PROVIDERS),
                context,
                lambda run_id: context.require(s.SCOPES).for_session(
                    load_source(context.require(s.CONTEXTS), run_id).session.id
                ),
                SnapshotCredentialResolver(context.require(s.CONNECTIONS)),
                RunImageResolver(
                    context.require(s.CONTEXTS), context.require(s.ATTACHMENTS)
                ),
            ),
        )
