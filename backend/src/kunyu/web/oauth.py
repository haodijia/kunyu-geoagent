"""One-use OAuth state authorizes callback delivery without a cookie."""
from fastapi import APIRouter, Request
from starlette.responses import PlainTextResponse
from kunyu.api.errors import ApiError
router = APIRouter()

@router.get("/api/v1/mcp/oauth/callback")
async def callback(request: Request):
    manager = request.app.state.mcp_manager.oauth
    for attempt in manager.attempts.values():
        if attempt.callback is not None and attempt.callback.accept(request.query_params):
            return PlainTextResponse("授权响应已接收，可以关闭此页面。", headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})
    raise ApiError(400, "INVALID_OAUTH_STATE", "Invalid or expired authorization state.")
