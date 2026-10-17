"""Record image-limit repairs before retrying through the Agent error waterfall."""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from pydantic import TypeAdapter

from kunyu.agent.core import services as s
from kunyu.agent.core.hooks import RequestErrorInvocation
from kunyu.agent.core.scope import Context
from kunyu.agent.runtime.contracts.hooks import RequestErrorAction, RequestRetry
from kunyu.agent.runtime.contracts.input_content import (
    InputMessageSource,
    MessageContentBlock,
)
from kunyu.agent.runtime.contracts.models import ModelErrorCode, ModelMessage, ModelRole
from kunyu.agent.runtime.events.assistant import RequestHeaderPayload
from kunyu.agent.runtime.events.context import ImageOffloadEvent, ImageOffloadPayload
from kunyu.agent.runtime.events.store import EventBatch
from kunyu.agent.runtime.projection.image_offload import select_oldest_images

_CONTENT = TypeAdapter(tuple[MessageContentBlock, ...])


class ImageOffloadPlugin:
    name = "compaction-image-offload"
    requires = (s.HOOKS, s.EVENTS)
    provides = ()

    async def apply(self, context: Context) -> None:
        events = context.require(s.EVENTS)

        async def recover(
            invocation: RequestErrorInvocation,
            next: Callable[[], Awaitable[RequestErrorAction]],
        ) -> RequestErrorAction:
            failure = invocation.failure
            if (
                failure.code != ModelErrorCode.IMAGE_OFFLOAD_REQUIRED
                or failure.offload_images is None
            ):
                return await next()
            invocation.signal.throw_if_cancelled()
            history = await events.list_after(invocation.run.session_id, 0)
            header = None
            for event in reversed(history):
                if (
                    event.run_id == invocation.run.run_id
                    and event.event_type == "request.header"
                ):
                    header = RequestHeaderPayload.model_validate(event.payload)
                    break
            if header is None or (header.step, header.attempt) != (
                invocation.run.step,
                invocation.run.attempt,
            ):
                raise ValueError("Image recovery has no matching request header.")
            messages = tuple(
                ModelMessage(
                    ModelRole(message["role"]),
                    _CONTENT.validate_python(message["content"]),
                    input_source=InputMessageSource.model_validate(
                        message["input_source"]
                    ),
                )
                for message in header.messages
                if message.get("input_source") is not None
                and message["role"] in {"user", "tool"}
            )
            targets = select_oldest_images(messages, failure.offload_images)
            if not targets:
                return await next()
            invocation.signal.throw_if_cancelled()
            await events.commit(
                EventBatch(
                    session_id=invocation.run.session_id,
                    run_id=None,
                    events=(
                        ImageOffloadEvent(
                            session_id=invocation.run.session_id,
                            event_type="image/offload",
                            payload=ImageOffloadPayload(targets=targets),
                            occurred_at=datetime.now(UTC),
                        ),
                    ),
                )
            )
            return RequestRetry(rebuild_context=True)

        context.require(s.HOOKS).request_error.register(context, self.name, recover)
