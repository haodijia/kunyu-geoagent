import argparse
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from kunyu.agent.bootstrap import create_agent_runtime
from kunyu.api.agent import router as agent_router
from kunyu.api.confirmations import router as confirmations_router
from kunyu.api.errors import install_error_handlers
from kunyu.api.messages import router as messages_router
from kunyu.api.model_connections import router as model_connections_router
from kunyu.api.sessions import router as sessions_router
from kunyu.api.system import require_desktop_session
from kunyu.api.system import router as system_router
from kunyu.api.workspaces import router as workspaces_router
from kunyu.application.connection_locks import ConnectionOperationLocks
from kunyu.application.model_catalog import ModelCatalogService
from kunyu.application.model_discovery_tasks import ModelDiscoveryTasks
from kunyu.desktop import DesktopConfigurationError, run_desktop
from kunyu.integrations.model.openai_compatible import OpenAICompatibleClient
from kunyu.persistence.database import Database
from kunyu.persistence.model_connections import SQLAlchemyModelConnectionRepository
from kunyu.settings import DESKTOP_RENDERER_ORIGINS, SESSION_HEADER


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    database = Database.open()
    locks = ConnectionOperationLocks()
    http_client = httpx.AsyncClient(
        follow_redirects=False,
        timeout=httpx.Timeout(30, connect=10),
    )
    repository = SQLAlchemyModelConnectionRepository(database)
    agent_runtime = create_agent_runtime(database, http_client, locks)
    catalog_service = ModelCatalogService(
        repository,
        repository,
        locks,
        OpenAICompatibleClient(http_client),
        agent_runtime.lifecycle,
    )
    discovery_tasks = ModelDiscoveryTasks(catalog_service)
    app.state.connection_operation_locks = locks
    app.state.model_catalog_service = catalog_service
    app.state.model_discovery_tasks = discovery_tasks
    app.state.database = database
    app.state.run_scheduler = agent_runtime.scheduler
    app.state.run_lifecycle_service = agent_runtime.lifecycle
    app.state.confirmation_service = agent_runtime.confirmations
    app.state.closing_event = agent_runtime.scheduler.closing_event
    await agent_runtime.kernel.start()
    await agent_runtime.scheduler.start()
    discovery_tasks.start()
    try:
        yield
    finally:
        agent_runtime.scheduler.begin_shutdown()
        await discovery_tasks.stop()
        await agent_runtime.scheduler.shutdown()
        await agent_runtime.kernel.stop()
        await http_client.aclose()
        database.close()


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
    app.include_router(model_connections_router)
    app.include_router(confirmations_router)
    app.include_router(agent_router)
    app.include_router(workspaces_router)
    app.include_router(sessions_router)
    app.include_router(messages_router)
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
