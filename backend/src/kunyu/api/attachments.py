"""Authenticated receipt admission and attachment byte delivery."""

import logging
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import Response

from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.application.attachment_preparation import AttachmentUpload, prepare_batch
from kunyu.domain.attachments import MAX_ATTACHMENTS, Attachment, AttachmentError
from kunyu.persistence.attachments import SQLAlchemyAttachmentStore
from kunyu.persistence.database import Database

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api/v1/sessions/{session_id}/attachments", tags=["attachments"]
)


class UploadBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[AttachmentUpload] = Field(min_length=1, max_length=MAX_ATTACHMENTS)


def get_attachment_store(
    database: Annotated[Database, Depends(get_database)],
) -> SQLAlchemyAttachmentStore:
    return SQLAlchemyAttachmentStore(database)


AttachmentStoreDependency = Annotated[
    SQLAlchemyAttachmentStore, Depends(get_attachment_store)
]


@router.post("", response_model=list[Attachment], status_code=201)
def upload_attachments(
    session_id: str, body: UploadBatch, store: AttachmentStoreDependency
) -> tuple[Attachment, ...]:
    try:
        return store.save_batch(session_id, prepare_batch(body.items))
    except AttachmentError as error:
        if error.status >= 500:
            logger.error(
                "Attachment storage error for session %s: %s", session_id, error.code
            )
        raise ApiError(error.status, error.code, str(error)) from error
    except Exception:
        logger.exception("Attachment publication failed for session %s", session_id)
        raise ApiError(
            503, "ATTACHMENT_STORAGE_FAILED", "Attachments could not be stored."
        ) from None


@router.get("/{attachment_id}")
def read_attachment(
    session_id: str, attachment_id: UUID, store: AttachmentStoreDependency
) -> Response:
    try:
        ref, data = store.read(session_id, str(attachment_id))
    except AttachmentError as error:
        if error.status >= 500:
            logger.error(
                "Attachment storage error for session %s: %s", session_id, error.code
            )
        raise ApiError(error.status, error.code, str(error)) from error
    except Exception:
        logger.exception("Attachment delivery failed for session %s", session_id)
        raise ApiError(
            503, "ATTACHMENT_READ_FAILED", "The attachment could not be read."
        ) from None
    return Response(
        data,
        media_type=ref.media_type
        if ref.kind == "image"
        else "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(ref.name, safe='')}",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
