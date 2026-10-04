"""Select plan mode and optionally submit a planning request."""

from dataclasses import replace

from kunyu.agent import services as s
from kunyu.agent.commands.registry import CommandInvocation, CommandResult
from kunyu.application.plan_mode import select_plan_mode


async def plan_command(invocation: CommandInvocation) -> CommandResult:
    agent = invocation.agent
    text = invocation.raw_input.strip()
    active = text != "off"
    if text and active and invocation.message is None:
        return CommandResult("error", "请先选择可用模型，再提交计划需求。")
    outcome = select_plan_mode(
        agent.ctx.require(s.DATABASE),
        agent.ctx.require(s.PROJECTIONS),
        agent.session_id,
        active,
    )
    if text and active:
        assert invocation.message is not None
        await agent.steer(replace(invocation.message, content=text))
    target = "计划模式" if active else "默认模式"
    if outcome == "queued":
        return CommandResult(
            "success", f"已选择{target}，从下一个接受的模型步骤起生效。"
        )
    if outcome == "cancelled":
        return CommandResult("success", f"已取消待生效的模式切换，保持{target}。")
    if outcome == "noop":
        return CommandResult("success", f"当前已选择{target}。")
    return CommandResult("success", f"已切换为{target}。")
