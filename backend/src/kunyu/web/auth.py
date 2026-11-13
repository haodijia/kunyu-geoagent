"""Instance sessions. Restart and logout invalidate issued credentials."""
import hashlib
import logging
import secrets
from time import monotonic
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from kunyu.api.errors import ApiError
from kunyu.web.config import WebConfig

logger = logging.getLogger(__name__)
COOKIE = "kunyu_access"
SESSION_SECONDS = 12 * 60 * 60
router = APIRouter(prefix="/api/v1/auth", tags=["access"])

class InstanceSessions:
    def __init__(self, config: WebConfig) -> None:
        self.config = config
        self.sessions: dict[str, float] = {}
        self.failures: list[float] = []

    def authenticated(self, request: Request) -> bool:
        now = monotonic()
        self.sessions = {key: end for key, end in self.sessions.items() if end > now}
        return request.cookies.get(COOKIE) in self.sessions

def require_same_origin(request: Request) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    origin = request.headers.get("origin")
    if request.headers.get("sec-fetch-site") == "cross-site" or (
        origin is not None and origin != request.app.state.web_config.origin
    ):
        raise ApiError(403, "ORIGIN_REJECTED", "Use the configured application origin.")

def require_web_session(request: Request) -> None:
    require_same_origin(request)
    if not request.app.state.web_sessions.authenticated(request):
        raise ApiError(401, "UNAUTHORIZED", "请先输入实例访问口令。")

class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: SecretStr = Field(min_length=1, max_length=4096)

@router.get("/session")
def session(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": request.app.state.web_sessions.authenticated(request)}

@router.post("/session", dependencies=[Depends(require_same_origin)])
def login(body: LoginRequest, request: Request, response: Response):
    service: InstanceSessions = request.app.state.web_sessions
    now = monotonic()
    service.failures = [item for item in service.failures if item > now - 60]
    if len(service.failures) >= 10:
        raise ApiError(429, "LOGIN_RATE_LIMIT", "尝试过于频繁，请稍后再试。")
    supplied = hashlib.sha256(body.password.get_secret_value().encode()).digest()
    expected = hashlib.sha256(service.config.password.encode()).digest()
    if not secrets.compare_digest(supplied, expected):
        service.failures.append(now)
        logger.warning("Instance login rejected.")
        raise ApiError(401, "INVALID_PASSWORD", "实例访问口令不正确。")
    service.sessions.pop(request.cookies.get(COOKIE), None)
    service.authenticated(request)
    token = secrets.token_urlsafe(32)
    service.sessions[token] = now + SESSION_SECONDS
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True,
        secure=service.config.public_url.startswith("https:"), samesite="lax", path=service.config.cookie_path)
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": True}

@router.delete("/session", dependencies=[Depends(require_same_origin)])
def logout(request: Request, response: Response):
    service: InstanceSessions = request.app.state.web_sessions
    service.sessions.pop(request.cookies.get(COOKIE), None)
    response.delete_cookie(COOKIE, path=service.config.cookie_path)
    return {"authenticated": False}
