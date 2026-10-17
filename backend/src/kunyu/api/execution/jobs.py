"""Observer reads never advance the model's background-output cursor."""

from fastapi import APIRouter, Query, Request

from kunyu.agent.runtime.contracts.tools import ToolExecutionError
from kunyu.api.errors import ApiError
from kunyu.persistence.geospatial.analysis_shared import require_session

router = APIRouter(prefix="/api/v1/sessions/{session_id}/jobs", tags=["jobs"])


@router.get("")
async def list_jobs(session_id: str, request: Request):
    with request.app.state.database.sessions() as transaction:
        require_session(transaction, session_id)
    return request.app.state.job_registry.list(session_id)


@router.get("/{job_id}/output")
async def read_output(
    session_id: str, job_id: str, request: Request, offset: int = Query(0, ge=0)
):
    try:
        return request.app.state.job_registry.read_at(job_id, session_id, offset)
    except ToolExecutionError as error:
        raise ApiError(
            404 if error.code == "JOB_NOT_FOUND" else 422, error.code, str(error)
        ) from None


@router.post("/{job_id}/cancel")
async def cancel_job(session_id: str, job_id: str, request: Request):
    try:
        return await request.app.state.job_registry.kill(job_id, session_id)
    except ToolExecutionError as error:
        raise ApiError(
            404 if error.code == "JOB_NOT_FOUND" else 409, error.code, str(error)
        ) from None
