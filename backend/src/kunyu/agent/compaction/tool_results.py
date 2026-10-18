"""Use the tool-authored compact channel only for history selected for compression."""

from dataclasses import replace

from kunyu.agent.runtime.contracts.models import ModelMessage, ModelRole
from kunyu.domain.conversation.agent_context import RunContextSource


def compact_tool_results(
    messages: tuple[ModelMessage, ...], source: RunContextSource
) -> tuple[ModelMessage, ...]:
    calls = {
        call.tool_call_id: call
        for run in source.reduced_session.runs
        for call in run.tool_calls
    }
    selected = []
    for message in messages:
        if (
            message.role is ModelRole.TOOL
            and message.input_source is not None
            and message.is_error is False
        ):
            call = calls[message.input_source.message_id]
            if call.compact is None:
                raise ValueError("A completed tool has no declared compact result.")
            message = replace(message, content=call.compact.content)
        selected.append(message)
    return tuple(selected)
