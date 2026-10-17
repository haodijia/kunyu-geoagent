"""Run projection assistant; derived exclusively from committed events."""

from kunyu.agent.runtime.contracts.content import (
    ReasoningBlock,
    TextBlock,
    ToolCallBlock,
    content_codepoints,
    content_text,
)
from kunyu.agent.runtime.contracts.models import BlockEnd, ReasoningDelta, TextDelta
from kunyu.agent.runtime.events.assistant import (
    AssistantCompletedEvent,
    AssistantDeltaEvent,
    AssistantReasoningDeltaEvent,
    AssistantStartedEvent,
    ModelAttemptFinishedEvent,
)
from kunyu.agent.runtime.events.base import RunState
from kunyu.agent.runtime.projection.run.budget import _add_known
from kunyu.agent.runtime.projection.run.guards import (
    _assistant,
    _attempt_assistant,
    _require_attempt,
    _require_reservation,
)
from kunyu.agent.runtime.projection.run_state import (
    RunReductionError,
    _Assistant,
    _State,
)
from kunyu.agent.runtime.streaming.assistant_stream import (
    FinishChunk,
    RawChunk,
    UsageChunk,
    expand_assistant_stream,
)
from kunyu.agent.runtime.streaming.block_assembler import BlockAssembler


def _start_assistant(
    state: _State, event: AssistantStartedEvent, sequence: int
) -> None:
    payload = event.payload
    if state.state is not RunState.MODEL_RUNNING:
        raise RunReductionError(
            "Assistant output can only start during model execution."
        )
    _require_reservation(state, "model")
    if (payload.step, payload.attempt) != (state.step, state.attempt):
        raise RunReductionError(
            "Assistant attempt does not match current run progress."
        )
    if payload.message_id in state.assistants:
        raise RunReductionError("Assistant message identifiers must be unique.")
    if any(
        item.step == payload.step and item.attempt == payload.attempt
        for item in state.assistants.values()
    ):
        raise RunReductionError("A model attempt can only own one assistant message.")
    state.assistants[payload.message_id] = _Assistant(
        message_id=payload.message_id,
        source_model=(
            state.model_snapshot
            if state.request_snapshot is None
            else state.request_snapshot
        ).model_id,
        step=payload.step,
        attempt=payload.attempt,
        created_at=event.occurred_at,
        created_sequence=sequence,
        updated_at=event.occurred_at,
        updated_sequence=sequence,
    )


def _append_delta(
    state: _State,
    event: AssistantDeltaEvent | AssistantReasoningDeltaEvent,
    sequence: int,
) -> None:
    assistant = _assistant(state, event.payload.message_id)
    payload = event.payload
    _require_attempt(assistant, payload.step, payload.attempt)
    reasoning = isinstance(event, AssistantReasoningDeltaEvent)
    content = assistant.reasoning_content if reasoning else assistant.content
    if (
        assistant.status != "streaming"
        or payload.offset != len(content)
        or not payload.text
    ):
        raise RunReductionError(
            "Assistant delta does not continue its codepoint offset."
        )
    if reasoning:
        assistant.reasoning_content += payload.text
    else:
        assistant.content += payload.text
    block_type = ReasoningBlock if reasoning else TextBlock
    if assistant.blocks and isinstance(assistant.blocks[-1], block_type):
        previous = assistant.blocks[-1]
        assistant.blocks = (
            *assistant.blocks[:-1],
            block_type(text=previous.text + payload.text),
        )
    else:
        assistant.blocks = (*assistant.blocks, block_type(text=payload.text))
    assistant.updated_at = event.occurred_at
    assistant.updated_sequence = sequence
    state.budget.output_codepoints += len(payload.text)


def _complete_assistant(
    state: _State, event: AssistantCompletedEvent, sequence: int
) -> None:
    assistant = _assistant(state, event.payload.message_id)
    payload = event.payload
    _require_attempt(assistant, payload.step, payload.attempt)
    if assistant.status != "streaming" or payload.content_length != len(
        assistant.content
    ):
        raise RunReductionError("Assistant completion does not match durable content.")
    if payload.finish_reason == "stop" and not assistant.content:
        raise RunReductionError(
            "A normal assistant completion must contain visible text."
        )
    assistant.status = "completed"
    assistant.finish_reason = payload.finish_reason
    assistant.updated_at = event.occurred_at
    assistant.updated_sequence = sequence


def _finish_model_attempt(
    state: _State, event: ModelAttemptFinishedEvent, sequence: int
) -> None:
    payload = event.payload
    if state.state is not RunState.MODEL_RUNNING:
        raise RunReductionError("Model outcomes require active model execution.")
    if state.reservations:
        raise RunReductionError("Model outcomes require a settled budget reservation.")
    assistant = _attempt_assistant(state, payload.step, payload.attempt)
    if assistant.model_outcome is not None:
        raise RunReductionError("A model attempt can only finish once.")
    if payload.message_id != assistant.message_id:
        raise RunReductionError(
            "Attempt settlement must identify its assistant message."
        )
    assembler = BlockAssembler()
    observed: dict[tuple[str, int], list[str]] = {}
    delivered: dict[str, list[str]] = {"text": [], "reasoning": []}
    outputs = expand_assistant_stream(payload.stream)
    for position, timed in enumerate(outputs):
        output = timed.output
        try:
            accepted = assembler.push(output)
        except (TypeError, ValueError) as error:
            if not (
                payload.outcome == "error"
                and payload.error_code == "PROVIDER_PROTOCOL"
                and position == len(outputs) - 1
            ):
                raise RunReductionError("Invalid model block stream.") from error
            break
        if not accepted:
            continue
        if isinstance(output, (TextDelta, ReasoningDelta)):
            kind = "reasoning" if isinstance(output, ReasoningDelta) else "text"
            observed.setdefault((kind, output.index), []).append(output.text)
            delivered[kind].append(output.text)
        elif isinstance(output, BlockEnd) and isinstance(
            output.block, (TextBlock, ReasoningBlock)
        ):
            if not "".join(observed.get((output.block.type, output.index), [])):
                delivered[output.block.type].append(output.block.text)
    text, reasoning = "".join(delivered["text"]), "".join(delivered["reasoning"])
    valid_prefix = (
        text.startswith(assistant.content)
        and reasoning.startswith(assistant.reasoning_content)
        if payload.error_code == "OUTPUT_LIMIT"
        else (text, reasoning) == (assistant.content, assistant.reasoning_content)
    )
    if not valid_prefix:
        raise RunReductionError(
            "Attempt stream does not match the delivered assistant prefix."
        )
    interrupted = (
        payload.outcome not in {"stop", "tool_calls", "length"}
        or payload.error_code == "OUTPUT_LIMIT"
    )
    limit = (
        len(assistant.content) + len(assistant.reasoning_content)
        if payload.error_code == "OUTPUT_LIMIT"
        else None
    )
    try:
        expected = assembler.blocks(interrupted=interrupted, output_limit=limit)
    except ValueError as error:
        raise RunReductionError("Incomplete canonical model blocks.") from error
    # Buffered provenance represents historical journal facts, including tool calls
    # recorded separately. It never claims native chunk timing for those calls.
    actual = (
        payload.blocks
        if payload.stream_origin == "model"
        else tuple(
            block for block in payload.blocks if not isinstance(block, ToolCallBlock)
        )
    )
    if actual != expected or payload.replay_state != (
        None if interrupted else assembler.replay_state
    ):
        raise RunReductionError(
            "Attempt content or replay metadata differs from its stream."
        )
    if payload.stream_origin == "model":
        usage = [
            record.chunk
            for record in payload.stream
            if isinstance(record, RawChunk) and isinstance(record.chunk, UsageChunk)
        ]
        if (
            len(usage) > 1
            and payload.outcome != "error"
            or not usage
            and any(
                value is not None
                for value in (
                    payload.input_tokens,
                    payload.output_tokens,
                    payload.total_tokens,
                )
            )
            or usage
            and (usage[0].input_tokens, usage[0].output_tokens, usage[0].total_tokens)
            != (payload.input_tokens, payload.output_tokens, payload.total_tokens)
        ):
            raise RunReductionError("Attempt accounting must match its stream usage.")
        finishes = [
            record.chunk.reason.value
            for record in payload.stream
            if isinstance(record, RawChunk) and isinstance(record.chunk, FinishChunk)
        ]
        if (
            payload.outcome in {"stop", "tool_calls", "content_filter"}
            or payload.outcome == "length"
            and payload.error_code != "OUTPUT_LIMIT"
        ) and finishes != [payload.outcome]:
            raise RunReductionError("Attempt outcome must match its stream finish.")
    if payload.outcome in {"stop", "tool_calls"}:
        if (
            assistant.status != "completed"
            or assistant.finish_reason != payload.outcome
        ):
            raise RunReductionError(
                "Model outcome does not match assistant completion."
            )
        if payload.error_code is not None:
            raise RunReductionError(
                "Successful model outcomes cannot carry an error code."
            )
    elif not payload.error_code:
        raise RunReductionError(
            "Unsuccessful model outcomes require a stable error code."
        )
    if payload.cumulative_active_milliseconds != state.budget.active_milliseconds:
        raise RunReductionError(
            "Model outcome active time differs from the run budget."
        )
    # Provider closure may replace a short preview with longer final content.
    # Count the larger of accepted delivery and final representation.
    delivered_codepoints = len(assistant.content) + len(assistant.reasoning_content)
    final_codepoints = content_codepoints(payload.blocks)
    state.budget.output_codepoints += max(0, final_codepoints - delivered_codepoints)
    assistant.blocks = payload.blocks
    assistant.replay_state = payload.replay_state
    assistant.content = content_text(payload.blocks)
    assistant.reasoning_content = content_text(payload.blocks, reasoning=True)
    assistant.model_outcome = payload.outcome
    if payload.outcome in {"error", "length", "content_filter"}:
        assistant.status = "failed"
    assistant.updated_at = event.occurred_at
    assistant.updated_sequence = sequence
    state.budget.input_tokens = _add_known(
        state.budget.input_tokens, payload.input_tokens
    )
    state.budget.output_tokens = _add_known(
        state.budget.output_tokens, payload.output_tokens
    )
    state.budget.total_tokens = _add_known(
        state.budget.total_tokens, payload.total_tokens
    )
