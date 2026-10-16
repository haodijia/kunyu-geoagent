import argparse
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager

import httpx
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from kunyu.agent import services as s
from kunyu.agent.bootstrap import create_agent_runtime
from kunyu.api.agent import router as agent_router
from kunyu.api.analysis import router as analysis_router
from kunyu.api.attachments import router as attachments_router
from kunyu.api.commands import router as commands_router
from kunyu.api.confirmations import router as confirmations_router
from kunyu.api.errors import install_error_handlers
from kunyu.api.jobs import router as jobs_router
from kunyu.api.map_locations import router as map_locations_router
from kunyu.api.mcp import router as mcp_router
from kunyu.api.messages import router as messages_router
from kunyu.api.model_connections import router as model_connections_router
from kunyu.api.oge import router as oge_router
from kunyu.api.plans import router as plans_router
from kunyu.api.questions import router as questions_router
from kunyu.api.sessions import router as sessions_router
from kunyu.api.skills import router as skills_router
from kunyu.api.storage import router as storage_router
from kunyu.api.subagents import router as subagents_router
from kunyu.api.system import require_desktop_session
from kunyu.api.system import router as system_router
from kunyu.api.workspace_files import router as workspace_files_router
from kunyu.api.workspaces import router as workspaces_router
from kunyu.application.connection_locks import ConnectionOperationLocks
from kunyu.application.model_catalog import ModelCatalogService
from kunyu.application.model_discovery_tasks import ModelDiscoveryTasks
from kunyu.application.skills import SkillManagementService
from kunyu.desktop import DesktopConfigurationError, run_desktop
from kunyu.integrations.geocoding import MapGeocoder
from kunyu.integrations.filesystem_io import check_cancelled
from kunyu.integrations.filesystem_operation import filesystem_operation
from kunyu.integrations.model.provider_client import ModelProviderClient
from kunyu.integrations.workspace_files import ManagedWorkspaceFiles
from kunyu.persistence.database import Database
from kunyu.persistence.model_connections import SQLAlchemyModelConnectionRepository
from kunyu.persistence.sessions import SQLAlchemySessionRepository
from kunyu.persistence.workspaces import SQLAlchemyWorkspaceRepository
from kunyu.settings import (
    DESKTOP_RENDERER_ORIGINS,
    SESSION_HEADER,
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


def create_app(session_token: str | None = None) -> FastAPI:
    app = FastAPI(
        title="Kunyu API",
        dependencies=[Depends(require_desktop_session)],
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(DESKTOP_RENDERER_ORIGINS),
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=[
            "Accept",
            "Content-Type",
            "Idempotency-Key",
            SESSION_HEADER,
        ],
    )
    app.state.session_token = session_token
    app.state.shutdown_callback = None
    install_error_handlers(app)
    app.include_router(system_router)
    app.include_router(storage_router)
    app.include_router(model_connections_router)
    app.include_router(oge_router)
    app.include_router(analysis_router)
    app.include_router(map_locations_router)
    app.include_router(jobs_router)
    app.include_router(mcp_router)
    app.include_router(confirmations_router)
    app.include_router(questions_router)
    app.include_router(plans_router)
    app.include_router(agent_router)
    app.include_router(commands_router)
    app.include_router(skills_router)
    app.include_router(subagents_router)
    app.include_router(workspaces_router)
    app.include_router(workspace_files_router)
    app.include_router(sessions_router)
    app.include_router(messages_router)
    app.include_router(attachments_router)
    return app


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Kunyu backend.")
    parser.add_argument(
        "--desktop",
        action="store_true",
        help="Run as a desktop sidecar on the loopback interface.",
    )
    args = parser.parse_args()

    if not args.desktop:
        parser.error("the --desktop option is required")

    try:
        run_desktop(create_app)
    except DesktopConfigurationError as error:
        parser.error(str(error))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
