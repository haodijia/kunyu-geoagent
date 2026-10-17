"""Validate model streams and publish buffered deltas; no retry or run scheduling."""

import logging
from collections.abc import Awaitable, Callable
from datetime import datetime

from kunyu.agent.runtime.contracts.content import (
    ReasoningBlock,
    TextBlock,
)
from kunyu.agent.runtime.contracts.hooks import (
    LoopHooks,
)
from kunyu.agent.runtime.contracts.models import (
    BlockEnd,
    BlockStart,
    ModelAdapter,
    ModelFinish,
    ModelRequest,
    ModelToolCallDelta,
    ReasoningDelta,
    TextDelta,
    TokenUsage,
)
from kunyu.agent.runtime.events.store import EventDraft
from kunyu.agent.runtime.execution.model_attempt import (
    ModelAttempt,
    delta_event,
)
from kunyu.agent.runtime.execution.model_output import ModelOutputError
from kunyu.agent.runtime.projection.run_state import ReducedRun

logger = logging.getLogger(__name__)


async def consume_model_stream[AdapterConfigT](
    run: ReducedRun,
    request: ModelRequest[AdapterConfigT],
    attempt: ModelAttempt,
    *,
    model: ModelAdapter[AdapterConfigT],
    hooks: LoopHooks,
    clock: Callable[[], datetime],
    commit: Callable[[ReducedRun, tuple[EventDraft, ...]], Awaitable[None]],
) -> None:
    stream = model.stream(request)
    terminal_seen = False
    try:
        async for output in stream:
            if terminal_seen:
                raise ModelOutputError("Output followed the terminal result.")
            try:
                timed = attempt.stream.push(output, int(clock().timestamp() * 1_000))
            except (TypeError, ValueError) as error:
                raise ModelOutputError(
                    "The model returned an invalid stream chunk."
                ) from error
            output = timed.output
            hooks.assistant_output(run, timed)
            try:
                accepted = attempt.assembler.push(output)
            except (TypeError, ValueError) as error:
                raise ModelOutputError(str(error)) from error
            if not accepted:
                logger.warning(
                    "Ignored redundant %s for model block %s in run %s",
                    type(output).__name__,
                    output.index,
                    run.run_id,
                )
                continue
            due = attempt.buffer.flush_if_due()
            if due is not None:
                await commit_model_delta(run, attempt, due, clock=clock, commit=commit)
            reasoning_due = attempt.reasoning_buffer.flush_if_due()
            if reasoning_due is not None:
                await commit_model_delta(
                    run,
                    attempt,
                    reasoning_due,
                    reasoning=True,
                    clock=clock,
                    commit=commit,
                )
            if isinstance(output, BlockEnd) and isinstance(
                output.block, (TextBlock, ReasoningBlock)
            ):
                observed = attempt.assembler.observed_text(
                    output.index, output.block.type
                )
                if not observed and output.block.text:
                    output = (
                        ReasoningDelta(output.index, output.block.text)
                        if isinstance(output.block, ReasoningBlock)
                        else TextDelta(output.index, output.block.text)
                    )
            if isinstance(output, (TextDelta, ReasoningDelta)):
                reasoning = isinstance(output, ReasoningDelta)
                buffer = attempt.reasoning_buffer if reasoning else attempt.buffer
                batch = buffer.add(output.text)
                if batch is not None:
                    await commit_model_delta(
                        run,
                        attempt,
                        batch,
                        reasoning=reasoning,
                        clock=clock,
                        commit=commit,
                    )
            elif isinstance(output, ModelToolCallDelta):
                pass  # Fragments are recorded; only complete calls may execute.
            elif isinstance(output, (BlockStart, BlockEnd)):
                pass  # The canonical assembler owns block lifecycle.
            elif isinstance(output, TokenUsage):
                pass
            elif isinstance(output, ModelFinish):
                if (
                    output.replay_state is not None
                    and attempt.assembler.replay_state is None
                ):
                    logger.warning(
                        "Discarded unaligned provider replay metadata for run %s",
                        run.run_id,
                    )
                terminal_seen = True
            else:
                raise ModelOutputError("Unknown model output.")
    finally:
        close = getattr(stream, "aclose", None)
        if close is not None:
            await close()
    if attempt.finish is None:
        raise ModelOutputError("The model stream ended without a finish result.")


async def commit_model_delta(
    run: ReducedRun,
    attempt: ModelAttempt,
    batch: tuple[int, str],
    *,
    reasoning: bool = False,
    clock: Callable[[], datetime],
    commit: Callable[[ReducedRun, tuple[EventDraft, ...]], Awaitable[None]],
) -> None:
    await commit(
        run,
        (delta_event(run, attempt, batch, clock(), reasoning=reasoning),),
    )
