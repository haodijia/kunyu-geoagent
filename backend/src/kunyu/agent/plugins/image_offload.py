"""Record image-limit repairs before retrying through the Agent error waterfall."""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from pydantic import TypeAdapter

from kunyu.agent import services as s
from kunyu.agent.hooks import RequestErrorInvocation
from kunyu.agent.runtime.events import (
    EventBatch,
    ImageOffloadEvent,
    ImageOffloadPayload,
    RequestHeaderPayload,
)
from kunyu.agent.runtime.hooks import RequestErrorAction, RequestRetry
from kunyu.agent.runtime.image_offload import select_oldest_images
from kunyu.agent.runtime.input_content import InputMessageSource, MessageContentBlock
from kunyu.agent.runtime.models import ModelErrorCode, ModelMessage, ModelRole
from kunyu.agent.scope import Context

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
                if message.get("input_source") is not None and message["role"] == "user"
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
