"""Application resource lifecycle and product service composition."""

from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager

import httpx
from fastapi import FastAPI

from kunyu.agent.bootstrap import create_agent_runtime
from kunyu.agent.core import services as s
from kunyu.application.models.catalog.service import ModelCatalogService
from kunyu.application.models.connection_locks import ConnectionOperationLocks
from kunyu.application.models.model_discovery_tasks import ModelDiscoveryTasks
from kunyu.application.skills.management import SkillManagementService
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.filesystem.operation import filesystem_operation
from kunyu.integrations.filesystem.workspaces import ManagedWorkspaceFiles
from kunyu.integrations.geospatial.geocoding import MapGeocoder
from kunyu.integrations.model.provider_client import ModelProviderClient
from kunyu.persistence.conversation.sessions import SQLAlchemySessionRepository
from kunyu.persistence.database import Database
from kunyu.persistence.models.connections import SQLAlchemyModelConnectionRepository
from kunyu.persistence.workspaces.repository import SQLAlchemyWorkspaceRepository
from kunyu.settings import (
    get_app_data_directory,
    get_geocoding_url,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    async with AsyncExitStack() as resources:
        database = Database.open()
        resources.callback(database.close)
        directories = ManagedWorkspaceFiles(database.path.parent)
        workspaces = SQLAlchemyWorkspaceRepository(database, directories).list_recent()

        def prepare_directories(cancelled) -> None:
            for workspace in workspaces:
                check_cancelled(cancelled, "prepare workspace")
                directories.prepare(workspace.id)

        await filesystem_operation(prepare_directories)
        locks = ConnectionOperationLocks()
        http_client = await resources.enter_async_context(
            httpx.AsyncClient(
                follow_redirects=False,
                timeout=httpx.Timeout(30, connect=10),
            )
        )
        repository = SQLAlchemyModelConnectionRepository(database)
        agent_runtime = await create_agent_runtime(database, http_client, locks)
        resources.push_async_callback(agent_runtime.kernel.stop)
        catalog_service = ModelCatalogService(
            repository,
            repository,
            locks,
            ModelProviderClient(agent_runtime.kernel.context.require(s.MODEL)),
            agent_runtime.lifecycle,
        )
        discovery_tasks = ModelDiscoveryTasks(catalog_service)
        resources.push_async_callback(discovery_tasks.stop)
        resources.callback(agent_runtime.scheduler.begin_shutdown)
        app.state.connection_operation_locks = locks
        app.state.model_catalog_service = catalog_service
        app.state.model_discovery_tasks = discovery_tasks
        app.state.map_geocoder = MapGeocoder(http_client, get_geocoding_url())
        app.state.database = database
        app.state.agent_kernel = agent_runtime.kernel
        app.state.run_scheduler = agent_runtime.scheduler
        app.state.run_lifecycle_service = agent_runtime.lifecycle
        app.state.confirmation_service = agent_runtime.confirmations
        app.state.question_service = agent_runtime.kernel.context.require(s.QUESTIONS)
        app.state.agent_directory = agent_runtime.agents
        app.state.job_registry = agent_runtime.kernel.context.require(s.JOBS)
        app.state.mcp_manager = agent_runtime.kernel.context.require(s.MCP)
        app.state.analysis_service = agent_runtime.kernel.context.require(s.ANALYSIS)
        app.state.map_repository = agent_runtime.kernel.context.require(s.MAPS)
        app.state.oge_service = agent_runtime.kernel.context.require(s.OGE)
        app.state.skill_service = SkillManagementService(
            agent_runtime.kernel.context,
            SQLAlchemySessionRepository(database),
            get_app_data_directory() / "skills",
        )
        app.state.closing_event = agent_runtime.scheduler.closing_event
        discovery_tasks.start()
        yield
