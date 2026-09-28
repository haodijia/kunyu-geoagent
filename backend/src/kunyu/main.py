import argparse
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from kunyu.api.errors import install_error_handlers
from kunyu.api.messages import router as messages_router
from kunyu.api.model_connections import router as model_connections_router
from kunyu.api.sessions import router as sessions_router
from kunyu.api.system import require_desktop_session
from kunyu.api.system import router as system_router
from kunyu.api.workspaces import router as workspaces_router
from kunyu.desktop import DesktopConfigurationError, run_desktop
from kunyu.persistence.database import Database
from kunyu.settings import DESKTOP_RENDERER_ORIGINS, SESSION_HEADER


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    database = Database.open()
    app.state.database = database
    try:
        yield
    finally:
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
        allow_headers=["Accept", "Content-Type", SESSION_HEADER],
    )
    app.state.session_token = session_token
    app.state.shutdown_callback = None
    install_error_handlers(app)
    app.include_router(system_router)
    app.include_router(model_connections_router)
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
