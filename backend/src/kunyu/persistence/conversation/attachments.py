"""Private immutable attachment objects, published with their owned receipts."""

import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session

from kunyu.domain.conversation.attachments import (
    MAX_ATTACHMENTS,
    MAX_BATCH_BYTES,
    Attachment,
    AttachmentError,
    ImageAttachment,
    PreparedAttachment,
    attachment_source_path,
    image_cache_path,
)
from kunyu.integrations.filesystem.names import numbered_name
from kunyu.persistence.database import Database
from kunyu.persistence.records.conversation import (
    SessionArchiveRecord,
    SessionAttachmentRecord,
    SessionRecord,
)
from kunyu.persistence.records.workspaces import WorkspaceRemovalRecord

logger = logging.getLogger(__name__)
REFERENCE = TypeAdapter(Attachment)


class SQLAlchemyAttachmentStore:
    def __init__(self, database: Database) -> None:
        self._database = database
        self._root = database.path.parent / "workspaces"

    def save_batch(
        self, session_id: str, items: tuple[PreparedAttachment, ...]
    ) -> tuple[Attachment, ...]:
        published: list[Path] = []
        refs: list[Attachment] = []
        try:
            with self._database.sessions() as transaction:
                transaction.execute(text("BEGIN IMMEDIATE"))
                session = require_session(transaction, session_id, writable=True)
                for item in items:
                    record = transaction.get(SessionAttachmentRecord, item.ref.id)
                    if record is not None:
                        stored = REFERENCE.validate_python(record.receipt)
                        if (
                            record.session_id != session_id
                            or record.source_name != item.ref.name
                            or record.receipt
                            != item.ref.model_copy(
                                update={"name": stored.name}
                            ).model_dump(mode="json")
                            or record.source_media_type != item.source_media_type
                            or record.source_bytes != len(item.source)
                            or self._read_object(
                                session.workspace_id,
                                stored,
                                source=True,
                                media_type=record.source_media_type,
                            )
                            != item.source
                        ):
                            raise AttachmentError(
                                "ATTACHMENT_IDENTITY_CONFLICT",
                                "Attachment identity was already used by another upload.",
                                409,
                            )
                        if self._read_object(session.workspace_id, stored) != item.data:
                            raise AttachmentError(
                                "ATTACHMENT_CORRUPT",
                                "Stored attachment bytes differ from the upload.",
                                503,
                            )
                        refs.append(stored)
                        continue
                    ref = item.ref
                    source = self._path(
                        session.workspace_id,
                        attachment_source_path(ref, item.source_media_type),
                    )
                    if not isinstance(ref, ImageAttachment) or ref.producer is None:
                        index = 1
                        while source.exists():
                            index += 1
                            ref = item.ref.model_copy(
                                update={"name": numbered_name(item.ref.name, index)}
                            )
                            source = self._path(
                                session.workspace_id,
                                attachment_source_path(ref, item.source_media_type),
                            )
                    source.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    _write_private(source, item.source)
                    published.append(source)
                    _sync_directory(source.parent)
                    if isinstance(ref, ImageAttachment):
                        normalized = self._path(
                            session.workspace_id, image_cache_path(ref)
                        )
                        normalized.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                        _write_private(normalized, item.data)
                        published.append(normalized)
                        _sync_directory(normalized.parent)
                    transaction.add(
                        SessionAttachmentRecord(
                            id=ref.id,
                            session_id=session_id,
                            receipt=ref.model_dump(mode="json"),
                            source_name=item.ref.name,
                            source_media_type=item.source_media_type,
                            source_bytes=len(item.source),
                            created_at=datetime.now(UTC),
                        )
                    )
                    refs.append(ref)
                transaction.commit()
                return tuple(refs)
        except Exception:
            for path in reversed(published):
                try:
                    path.unlink()
                except OSError:
                    logger.exception(
                        "Failed to remove unpublished attachment: %s", path.name
                    )
            raise

    def resolve(
        self, session_id: str, identities: tuple[str, ...]
    ) -> tuple[Attachment, ...]:
        with self._database.sessions() as transaction:
            require_session(transaction, session_id)
            return resolve_references(transaction, session_id, identities)

    def read(self, session_id: str, identity: str) -> tuple[Attachment, bytes]:
        with self._database.sessions() as tx:
            session = require_session(tx, session_id)
            ref = resolve_references(tx, session_id, (identity,))[0]
            return ref, self._read_object(session.workspace_id, ref)

    def read_original(
        self, session_id: str, identity: str
    ) -> tuple[Attachment, bytes, str | None]:
        with self._database.sessions() as tx:
            session = require_session(tx, session_id)
            ref = resolve_references(tx, session_id, (identity,))[0]
            record = tx.get(SessionAttachmentRecord, identity)
            data = self._read_object(
                session.workspace_id,
                ref,
                source=True,
                media_type=record.source_media_type,
            )
            if len(data) != record.source_bytes:
                raise AttachmentError(
                    "ATTACHMENT_CORRUPT", "Stored original byte count is invalid.", 503
                )
            return ref, data, record.source_media_type

    def _path(self, workspace_id: str, virtual_path: str) -> Path:
        return self._root / workspace_id / virtual_path.removeprefix("/workspace/")

    def _read_object(
        self,
        workspace_id: str,
        ref: Attachment,
        *,
        source: bool = False,
        media_type: str | None = None,
    ) -> bytes:
        virtual = (
            attachment_source_path(ref, media_type)
            if source
            else image_cache_path(ref)
            if isinstance(ref, ImageAttachment)
            else attachment_source_path(ref, None)
        )
        path = self._path(workspace_id, virtual)
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
            logger.exception("Could not read attachment: %s", ref.id)
            raise AttachmentError(
                "ATTACHMENT_READ_FAILED", "The attachment file could not be read.", 503
            ) from error


def require_session(
    transaction: Session, session_id: str, *, writable: bool = False
) -> SessionRecord:
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
    return session


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
        try:
            path.chmod(0o600)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        except BaseException:
            try:
                path.unlink()
            except OSError:
                logger.exception(
                    "Failed to remove incomplete attachment: %s", path.name
                )
            raise


def _sync_directory(path: Path) -> None:
    if os.name == "posix":
        directory = os.open(path, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
