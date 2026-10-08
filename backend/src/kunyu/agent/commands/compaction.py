"""Idle-session command admission for the shared compaction service."""

from kunyu.agent.commands.registry import CommandInvocation, CommandResult
from kunyu.agent.compaction import compact_context
from kunyu.agent.runtime.events import TERMINAL_RUN_STATES


async def compact_history(invocation: CommandInvocation) -> CommandResult:
    agent = invocation.agent
    if invocation.raw_input.strip():
        return CommandResult("error", "/compact 不接受参数。")
    if any(turn.run.state not in TERMINAL_RUN_STATES for turn in agent.turns()):
        return CommandResult("error", "当前 Agent 尚未空闲，不能压缩历史。")
    if not agent.turns():
        return CommandResult("success", "当前没有可压缩的对话历史。")
    result = await compact_context(
        agent,
        agent.turns()[-1].run.id,
        trigger="manual",
        command_id=invocation.command_id,
    )

    return CommandResult(result.kind, result.text, result.source_event_sequence)
