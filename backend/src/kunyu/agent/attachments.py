"""Materialize only image references admitted into this run's model history."""

import asyncio

from kunyu.agent.context import build_model_history
from kunyu.agent.runtime.input_content import ImageInputBlock
from kunyu.agent.runtime.models import ModelAdapterError, ModelErrorCode
from kunyu.agent.tools.shared import load_source
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.attachments import AttachmentError, ImageAttachment
from kunyu.persistence.attachments import SQLAlchemyAttachmentStore


class RunImageResolver:
    def __init__(
        self, contexts: RunContextRepository, attachments: SQLAlchemyAttachmentStore
    ) -> None:
        self._contexts = contexts
        self._attachments = attachments

    async def __call__(self, run_id: str, ref: ImageAttachment) -> bytes:
        source = load_source(self._contexts, run_id)
        if not any(
            isinstance(block, ImageInputBlock) and block.attachment == ref
            for message in build_model_history(source)
            for block in message.content
        ):
            raise ModelAdapterError(
                ModelErrorCode.INVALID_REQUEST,
                "The image was not admitted into this run's history.",
            )
        try:
            stored, data = await asyncio.to_thread(
                self._attachments.read, source.session.id, ref.id
            )
        except AttachmentError as error:
            raise ModelAdapterError(
                ModelErrorCode.INVALID_REQUEST, str(error)
            ) from error
        if stored != ref:
            raise ModelAdapterError(
                ModelErrorCode.INVALID_REQUEST,
                "The image receipt differs from committed history.",
            )
        return data
