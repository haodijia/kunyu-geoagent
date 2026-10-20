"""Only a pending, session-owned capture may receive map PNG bytes or a UI error."""

from typing import Literal

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from kunyu.api.errors import ApiError
from kunyu.application.analysis.map_capture import MapCaptureError
from kunyu.domain.conversation.attachments import MAX_ATTACHMENT_BYTES

router = APIRouter(prefix="/api/v1/sessions/{session_id}/map/captures", tags=["maps"])


class CaptureFailure(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: Literal["MAP_NOT_OPEN", "MAP_NOT_READY", "MAP_CAPTURE_FAILED"]
    message: str = Field(min_length=1, max_length=1000)


@router.post("/{request_id}", status_code=204)
async def complete_capture(
    session_id: str, request_id: str, request: Request
) -> Response:
    service = request.app.state.map_capture_service
    try:
        service.require_pending(session_id, request_id)
        try:
            result = await _capture_result(request)
        except ApiError as error:
            service.complete(
                session_id, request_id, MapCaptureError(error.code, error.message)
            )
            raise
        service.complete(session_id, request_id, result)
    except MapCaptureError as error:
        raise ApiError(404, error.code, str(error)) from None
    return Response(status_code=204)


async def _capture_result(request: Request) -> bytes | MapCaptureError:
    content_type = request.headers.get("content-type", "").split(";", 1)[0]
    if content_type == "image/png":
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > MAX_ATTACHMENT_BYTES:
                raise ApiError(
                    413, "MAP_CAPTURE_TOO_LARGE", "Map screenshot exceeds 16 MiB."
                )
        result = bytes(data)
        if not result.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ApiError(
                422, "MAP_CAPTURE_INVALID", "A PNG map screenshot is required."
            )
    elif content_type == "application/json":
        try:
            failure = CaptureFailure.model_validate(await request.json())
        except ValueError as error:
            raise ApiError(
                422, "MAP_CAPTURE_INVALID", "Invalid map capture error response."
            ) from error
        result = MapCaptureError(failure.code, failure.message)
    else:
        raise ApiError(
            415,
            "MAP_CAPTURE_INVALID",
            "Send image/png or an application/json capture error.",
        )
    return result
