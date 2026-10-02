"""Provider-routed request recovery: durable plan, cancellable wait, retry."""

import asyncio
import logging
import math
import random
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from uuid import uuid4

from kunyu.agent import services as s
from kunyu.agent.hooks import RequestErrorInvocation
from kunyu.agent.runtime.events import (
    EventBatch,
    RequestFailurePayload,
    RetryScheduledEvent,
    RetryScheduledPayload,
    RetryStartedEvent,
    RetryStartedPayload,
)
from kunyu.agent.runtime.hooks import RequestErrorAction
from kunyu.agent.runtime.retry_policy import NormalRetryPolicy, retry_policy_key
from kunyu.agent.scope import Context

logger = logging.getLogger(__name__)


class RetryPlugin:
    name = "llm-retry"
    requires = (s.HOOKS, s.EVENTS)
    provides = ()

    async def apply(self, context: Context) -> None:
        executor = _RetryExecutor(context)
        context.require(s.HOOKS).request_error.register(
            context, self.name, executor.recover
        )
        context.effect(executor.close, before_children=True)


class _RetryExecutor:
    def __init__(self, context: Context) -> None:
        self._events = context.require(s.EVENTS)
        self._closed = asyncio.Event()
        self._active: set[asyncio.Task] = set()

    async def close(self) -> None:
        self._closed.set()
        await asyncio.gather(*tuple(self._active), return_exceptions=True)

    async def recover(
        self,
        invocation: RequestErrorInvocation,
        next: Callable[[], Awaitable[RequestErrorAction]],
    ) -> RequestErrorAction:
        if self._closed.is_set():
            return None
        task = asyncio.create_task(self._recover(invocation, next))
        self._active.add(task)
        try:
            return await task
        finally:
            self._active.discard(task)

    async def _recover(
        self,
        invocation: RequestErrorInvocation,
        next: Callable[[], Awaitable[RequestErrorAction]],
    ) -> RequestErrorAction:
        failure = invocation.failure
        policy, provider = failure.retry_policy, failure.provider
        if policy is None or provider is None:
            return await next()
        if policy.mode == "always":
            try:
                downstream = await next()
            except Exception:
                logger.exception(
                    "Always retry delegated recovery failed for %s.",
                    invocation.run.run_id,
                )
                downstream = None
            invocation.signal.throw_if_cancelled()
            if self._closed.is_set():
                return None
            if downstream == "retry":
                return downstream
        elif failure.code not in policy.retryable_codes:
            return await next()
        key = retry_policy_key(policy)
        history = [
            RetryScheduledPayload.model_validate(event.payload)
            for event in await self._events.list_after(invocation.agent.session_id, 0)
            if event.run_id == invocation.run.run_id
            and event.event_type == "llm/retry"
            and event.payload["step"] == invocation.run.step
            and event.payload["provider"] == provider
            and event.payload["policy_key"] == key
        ]
        previous = history[-1] if history else None
        count = 0 if previous is None else previous.retry
        if isinstance(policy, NormalRetryPolicy) and count >= policy.max_retries:
            return await next()
        retry = count + 1
        exponent = retry - 1
        cap_exponent = math.log2(policy.max_delay_ms) - math.log2(
            policy.initial_delay_ms
        )
        exponential = (
            policy.max_delay_ms
            if exponent >= cap_exponent
            else math.ldexp(policy.initial_delay_ms, exponent)
        )
        delay = min(
            policy.max_delay_ms,
            exponential
            * (1 - policy.jitter_ratio + 2 * policy.jitter_ratio * random.random()),
        )
        after = failure.provider_retry_after_ms
        if after is not None and math.isfinite(after) and after > 0:
            if after > policy.max_delay_ms:
                if policy.mode == "normal":
                    return await next()
            else:
                delay = after
        invocation.signal.throw_if_cancelled()
        if self._closed.is_set():
            return None
        identity = str(uuid4()) if previous is None else previous.retry_id
        payload = RetryScheduledPayload(
            retry_id=identity,
            step=invocation.run.step,
            attempt=invocation.run.attempt,
            provider=provider,
            mode=policy.mode,
            policy_key=key,
            retry=retry,
            max_retries=policy.max_retries
            if isinstance(policy, NormalRetryPolicy)
            else None,
            delay_ms=delay,
            failure=RequestFailurePayload(
                code=failure.code,
                message=failure.message[:500],
                provider_retry_after_ms=after
                if after is not None and math.isfinite(after) and after > 0
                else None,
            ),
        )
        await self._events.commit(
            EventBatch(
                invocation.agent.session_id,
                invocation.run.run_id,
                (
                    RetryScheduledEvent(
                        session_id=invocation.agent.session_id,
                        run_id=invocation.run.run_id,
                        event_type="llm/retry",
                        payload=payload,
                        occurred_at=datetime.now(UTC),
                    ),
                ),
            )
        )
        try:
            await asyncio.wait_for(self._closed.wait(), delay / 1_000)
            return None
        except TimeoutError:
            invocation.signal.throw_if_cancelled()
        if self._closed.is_set():
            return None
        await self._events.commit(
            EventBatch(
                invocation.agent.session_id,
                invocation.run.run_id,
                (
                    RetryStartedEvent(
                        session_id=invocation.agent.session_id,
                        run_id=invocation.run.run_id,
                        event_type="llm/retry-started",
                        payload=RetryStartedPayload(
                            retry_id=identity,
                            step=invocation.run.step,
                            attempt=invocation.run.attempt,
                            retry=retry,
                        ),
                        occurred_at=datetime.now(UTC),
                    ),
                ),
            )
        )
        return "retry"
