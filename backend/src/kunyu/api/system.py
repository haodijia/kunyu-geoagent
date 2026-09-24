import secrets
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel

from kunyu.settings import API_VERSION, SESSION_HEADER

router = APIRouter(prefix="/api/v1/system", tags=["system"])


class HealthResponse(BaseModel):
    status: Literal["healthy"]
    api_version: Literal["1"]


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
