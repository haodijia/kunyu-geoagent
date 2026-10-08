"""Harness between-step pressure and bounded provider overflow recovery."""

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from kunyu.agent import services as s
from kunyu.agent.compaction import compact_context
from kunyu.agent.compaction_pressure import PressureConfigurationError, PressurePolicy
from kunyu.agent.hooks import PreStepInvocation, RequestErrorInvocation
from kunyu.agent.runtime.hooks import RequestErrorAction, RequestRetry, StepDecision
from kunyu.agent.runtime.models import ModelErrorCode
from kunyu.agent.scope import Context

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class CompactionConfig:
    pressure: PressurePolicy = field(default_factory=PressurePolicy)
    compaction_retries: int = 1
    max_overflow_retries: int = 1

    def __post_init__(self) -> None:
        for value in (self.compaction_retries, self.max_overflow_retries):
            if type(value) is not int or value < 0:
                raise ValueError(
                    "Compaction retry limits must be nonnegative integers."
                )


DEFAULT_COMPACTION_CONFIG = CompactionConfig()


class CompactionPlugin:
    name = "compaction-basic"
    requires = (
        s.HOOKS,
        s.EVENTS,
        s.CONTEXTS,
        s.PROJECTIONS,
        s.DATABASE,
        s.EXECUTIONS,
        s.MODEL,
    )
    provides = ()

    def __init__(self, config: CompactionConfig = DEFAULT_COMPACTION_CONFIG) -> None:
        self.config = config

    async def apply(self, context: Context) -> None:
        hooks, events = context.require(s.HOOKS), context.require(s.EVENTS)
        warned: set[tuple[str, str, int]] = set()

        async def pressure(
            invocation: PreStepInvocation,
            next: Callable[[], Awaitable[StepDecision]],
        ) -> StepDecision:
            for attempt in range(self.config.compaction_retries + 1):
                invocation.signal.throw_if_cancelled()
                try:
                    result = await compact_context(
                        invocation.agent,
                        invocation.run.run_id,
                        trigger="pressure",
                        pressure_policy=self.config.pressure,
                    )
                except PressureConfigurationError as error:
                    key = error.target
                    if key not in warned:
                        warned.add(key)
                        logger.warning(
                            "Automatic compaction unavailable for %s: %s", key, error
                        )
                    break
                if result.kind == "error":
                    logger.warning(
                        "Step compaction failed for %s: %s",
                        invocation.run.run_id,
                        result.text,
                    )
                    break
                if result.source_event_sequence is None:
                    break
                logger.info(
                    "Step compaction checkpoint session=%s sequence=%s",
                    invocation.agent.session_id,
                    result.source_event_sequence,
                )
                if not result.above_threshold:
                    break
                if attempt == self.config.compaction_retries:
                    logger.warning(
                        "Compaction remains above pressure threshold for %s after %s attempts.",
                        invocation.run.run_id,
                        attempt + 1,
                    )
            invocation.signal.throw_if_cancelled()
            return await next()

        async def overflow(
            invocation: RequestErrorInvocation,
            next: Callable[[], Awaitable[RequestErrorAction]],
        ) -> RequestErrorAction:
            if invocation.failure.code != ModelErrorCode.CONTEXT_WINDOW_EXCEEDED:
                return await next()
            invocation.signal.throw_if_cancelled()
            history = await events.list_after(invocation.agent.session_id, 0)
            # Each successful assistant response resets the overflow chain. Read
            # durable ownership instead of retaining Agent objects after a turn.
            boundary = max(
                (
                    event.sequence
                    for event in history
                    if event.run_id == invocation.run.run_id
                    and event.event_type == "message.assistant.completed"
                ),
                default=0,
            )
            recoveries = sum(
                event.event_type == "compaction/start"
                and event.sequence > boundary
                and event.payload["owner_run_id"] == invocation.run.run_id
                and event.payload["trigger"] == "context-overflow"
                for event in history
            )
            if recoveries >= self.config.max_overflow_retries:
                return await next()
            result = await compact_context(
                invocation.agent,
                invocation.run.run_id,
                trigger="context-overflow",
            )
            invocation.signal.throw_if_cancelled()
            if result.kind == "error":
                logger.warning(
                    "Overflow compaction failed for %s: %s",
                    invocation.run.run_id,
                    result.text,
                )
                return await next()
            if result.source_event_sequence is None:
                return await next()
            logger.info(
                "Overflow compaction checkpoint session=%s sequence=%s",
                invocation.agent.session_id,
                result.source_event_sequence,
            )
            return RequestRetry(rebuild_context=True)

        hooks.pre_step.register(context, self.name, pressure)
        hooks.request_error.register(context, self.name, overflow)
