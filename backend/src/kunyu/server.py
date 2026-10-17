"""FastAPI application factory; startup resources live in bootstrap."""

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from kunyu.api.errors import install_error_handlers
from kunyu.api.router import router
from kunyu.api.system.routes import require_desktop_session
from kunyu.bootstrap import lifespan
from kunyu.settings import (
    DESKTOP_RENDERER_ORIGINS,
    SESSION_HEADER,
)


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
    app.include_router(router)
    return app
