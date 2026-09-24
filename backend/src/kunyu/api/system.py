import secrets
from collections.abc import Callable
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request, status
from pydantic import BaseModel

from kunyu.settings import API_VERSION, SESSION_HEADER

router = APIRouter(prefix="/api/v1/system", tags=["system"])


class HealthResponse(BaseModel):
    status: Literal["healthy"]
    api_version: Literal["1"]


class ShutdownResponse(BaseModel):
    status: Literal["shutting_down"]


def require_desktop_session(
    request: Request,
    session_token: str | None = Header(default=None, alias=SESSION_HEADER),
) -> None:
    expected_token: str | None = request.app.state.session_token
    if (
        expected_token is None
        or session_token is None
        or not secrets.compare_digest(session_token, expected_token)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid desktop session.",
        )


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    return HealthResponse(status="healthy", api_version=API_VERSION)


@router.post(
    "/shutdown",
    response_model=ShutdownResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def shutdown_backend(
    request: Request,
    background_tasks: BackgroundTasks,
) -> ShutdownResponse:
    shutdown_callback: Callable[[], None] | None = request.app.state.shutdown_callback
    if shutdown_callback is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Desktop shutdown is unavailable.",
        )

    background_tasks.add_task(shutdown_callback)
    return ShutdownResponse(status="shutting_down")
