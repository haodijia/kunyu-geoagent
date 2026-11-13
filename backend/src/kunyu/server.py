"""Same-origin application hosting with authenticated business routes."""

from fastapi import Depends, FastAPI, Request
from starlette.responses import FileResponse, RedirectResponse

from kunyu.api.errors import ApiError, install_error_handlers
from kunyu.api.router import router
from kunyu.api.system.routes import router as health_router
from kunyu.bootstrap import lifespan
from kunyu.web.auth import InstanceSessions, require_web_session
from kunyu.web.auth import router as auth_router
from kunyu.web.config import WebConfig
from kunyu.web.oauth import router as oauth_router
from kunyu.web.oge_proxy import router as proxy_router


def create_app() -> FastAPI:
    config = WebConfig.read()
    app = FastAPI(title="Kunyu API", root_path=config.root_path, lifespan=lifespan)
    app.state.web_config = config
    app.state.web_sessions = InstanceSessions(config)
    install_error_handlers(app)
    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(oauth_router)
    app.include_router(router, dependencies=[Depends(require_web_session)])
    app.include_router(proxy_router, dependencies=[Depends(require_web_session)])

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str, request: Request):
        if path == "api" or path.startswith(("api/", "openge/")) or path == "openge":
            raise ApiError(404, "NOT_FOUND", "Unknown API endpoint.")
        if not path and not request.url.path.endswith("/"):
            return RedirectResponse(config.cookie_path, status_code=307)
        target = (config.frontend / path).resolve()
        if not target.is_relative_to(config.frontend):
            raise ApiError(404, "NOT_FOUND", "Resource not found.")
        if target.is_file():
            return FileResponse(target)
        if path.startswith("assets/") or "." in path.rsplit("/", 1)[-1]:
            raise ApiError(404, "NOT_FOUND", "Resource not found.")
        return FileResponse(
            config.frontend / "index.html", headers={"Cache-Control": "no-store"}
        )

    return app
