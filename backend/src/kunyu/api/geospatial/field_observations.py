"""Register field photos and notes against a selected object."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.application.analysis.object_review import ObjectReviewService
from kunyu.domain.conversation.attachments import AttachmentError
from kunyu.domain.geospatial.field_observation import (
    FieldObservation,
    RecordFieldObservation,
)
from kunyu.persistence.database import Database
from kunyu.persistence.geospatial.field_observations import FieldObservations

router = APIRouter(
    prefix="/api/v1/sessions/{session_id}/field-observations", tags=["analysis"]
)


@router.post("", response_model=FieldObservation, status_code=201)
def record_field_observation(
    session_id: str,
    body: RecordFieldObservation,
    request: Request,
    database: Annotated[Database, Depends(get_database)],
):
    store = FieldObservations(database)
    try:
        workspace = store.workspace(session_id)
        target = ObjectReviewService(request.app.state.analysis_service).target(
            workspace, body.reference
        )
        return store.record(session_id, workspace, target, body)
    except AttachmentError as error:
        raise ApiError(error.status, error.code, str(error)) from error
