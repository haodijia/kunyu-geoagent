"""Private immutable attachment objects, published with their owned receipts."""

import logging
import os
import shutil
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session

from kunyu.application.attachment_preparation import PreparedAttachment
from kunyu.domain.attachments import (
    MAX_ATTACHMENTS,
    MAX_BATCH_BYTES,
    Attachment,
    AttachmentError,
)
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    SessionArchiveRecord,
    SessionAttachmentRecord,
    SessionRecord,
    WorkspaceRemovalRecord,
)

logger = logging.getLogger(__name__)
REFERENCE = TypeAdapter(Attachment)


class SQLAlchemyAttachmentStore:
    def __init__(self, database: Database) -> None:
        self._database = database
        self._root = database.path.parent / "attachments"

    def save_batch(
        self, session_id: str, items: tuple[PreparedAttachment, ...]
    ) -> tuple[Attachment, ...]:
        published: list[Path] = []
        staging: list[Path] = []
        try:
            with self._database.sessions() as transaction:
                transaction.execute(text("BEGIN IMMEDIATE"))
                require_session(transaction, session_id, writable=True)
                # Verify every reused identity before creating any new object.
                fresh = []
                for item in items:
                    record = transaction.get(SessionAttachmentRecord, item.ref.id)
                    if record is None:
                        fresh.append(item)
                    elif (
                        record.session_id != session_id
                        or record.receipt != item.ref.model_dump(mode="json")
                        or record.source_media_type != item.source_media_type
                        or record.source_bytes != len(item.source)
                    ):
                        raise AttachmentError(
                            "ATTACHMENT_IDENTITY_CONFLICT",
                            "Attachment identity was already used by another upload.",
                            409,
                        )
                    elif self._read_object(item.ref, source=True) != item.source:
                        raise AttachmentError(
                            "ATTACHMENT_IDENTITY_CONFLICT",
                            "Attachment identity was already used with different bytes.",
                            409,
                        )
                    elif self._read_object(item.ref) != item.data:
                        raise AttachmentError(
                            "ATTACHMENT_CORRUPT",
                            "Stored attachment bytes differ from the upload.",
                            503,
                        )

                self._root.mkdir(mode=0o700, parents=True, exist_ok=True)
                self._root.chmod(0o700)
                for item in fresh:
                    target = self._root / item.ref.id
                    if target.exists():
                        raise AttachmentError(
                            "ATTACHMENT_STORAGE_CONFLICT",
                            "An unpublished object already occupies this attachment identity.",
                            503,
                        )
                    temporary = self._root / f"upload_{uuid4()}"
                    temporary.mkdir(mode=0o700)
                    staging.append(temporary)
                    _write_private(temporary / "content", item.data)
                    if item.ref.kind == "image":
                        _write_private(temporary / "source", item.source)
                    _sync_directory(temporary)
                    temporary.rename(target)
                    staging.remove(temporary)
                    published.append(target)
                    _sync_directory(self._root)
                    transaction.add(
                        SessionAttachmentRecord(
                            id=item.ref.id,
                            session_id=session_id,
                            receipt=item.ref.model_dump(mode="json"),
                            source_media_type=item.source_media_type,
                            source_bytes=len(item.source),
                            created_at=datetime.now(UTC),
                        )
                    )
                transaction.commit()
                return tuple(item.ref for item in items)
        except Exception:
            for path in (*staging, *published):
                try:
                    shutil.rmtree(path)
                except OSError:
                    logger.exception(
                        "Failed to remove an unpublished attachment object: %s",
                        path.name,
                    )
            raise

    def resolve(
        self, session_id: str, identities: tuple[str, ...]
    ) -> tuple[Attachment, ...]:
        with self._database.sessions() as transaction:
            require_session(transaction, session_id)
            return resolve_references(transaction, session_id, identities)

    def read(self, session_id: str, identity: str) -> tuple[Attachment, bytes]:
        ref = self.resolve(session_id, (identity,))[0]
        return ref, self._read_object(ref)

    def _read_object(self, ref: Attachment, *, source: bool = False) -> bytes:
        # The identity has already been validated by the durable receipt schema.
        path = (
            self._root
            / ref.id
            / ("source" if source and ref.kind == "image" else "content")
        )
        try:
            with path.open("rb") as stream:
                data = stream.read(16 * 1024 * 1024 + 1)
            if (not source and len(data) != ref.bytes) or len(data) > 16 * 1024 * 1024:
                raise AttachmentError(
                    "ATTACHMENT_CORRUPT",
                    "Stored attachment byte count is invalid.",
                    503,
                )
            return data
        except OSError as error:
            logger.exception("Could not read attachment object: %s", ref.id)
            raise AttachmentError(
                "ATTACHMENT_READ_FAILED",
                "The attachment object could not be read.",
                503,
            ) from error


def require_session(
    transaction: Session, session_id: str, *, writable: bool = False
) -> None:
    session = transaction.get(SessionRecord, session_id)
    if (
        session is None
        or transaction.get(WorkspaceRemovalRecord, session.workspace_id) is not None
    ):
        raise AttachmentError("NOT_FOUND", "The attachment session was not found.", 404)
    if writable and transaction.get(SessionArchiveRecord, session_id) is not None:
        raise AttachmentError(
            "SESSION_ARCHIVED", "Archived sessions cannot receive attachments.", 409
        )


def resolve_references(
    transaction: Session, session_id: str, identities: tuple[str, ...]
) -> tuple[Attachment, ...]:
    if len(identities) > MAX_ATTACHMENTS or len(set(identities)) != len(identities):
        raise AttachmentError(
            "INVALID_ATTACHMENT",
            "Attachment identities must be distinct and limited to eight.",
        )
    refs = []
    for identity in identities:
        try:
            if str(UUID(identity)) != identity:
                raise ValueError("Noncanonical UUID")
        except ValueError as error:
            raise AttachmentError(
                "INVALID_ATTACHMENT", "Attachment identity must be a canonical UUID."
            ) from error
        record = transaction.get(SessionAttachmentRecord, identity)
        if record is None or record.session_id != session_id:
            raise AttachmentError(
                "ATTACHMENT_NOT_FOUND",
                "The attachment does not belong to this session.",
                404,
            )
        try:
            ref = REFERENCE.validate_python(record.receipt)
        except ValidationError as error:
            raise AttachmentError(
                "ATTACHMENT_CORRUPT", "The stored attachment receipt is invalid.", 503
            ) from error
        if ref.id != record.id:
            raise AttachmentError(
                "ATTACHMENT_CORRUPT",
                "The attachment receipt contains an inconsistent identity.",
                503,
            )
        refs.append(ref)
    if sum(ref.bytes for ref in refs) > MAX_BATCH_BYTES:
        raise AttachmentError(
            "ATTACHMENT_TOO_LARGE", "Message attachments exceed the byte limit.", 413
        )
    return tuple(refs)


def _write_private(path: Path, data: bytes) -> None:
    with path.open("xb") as stream:
        path.chmod(0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def _sync_directory(path: Path) -> None:
    if os.name == "posix":
        directory = os.open(path, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
