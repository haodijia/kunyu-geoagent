"""Plan command, prompt guidance, and accepted-step narration."""

from collections.abc import Awaitable, Callable
from dataclasses import replace
from uuid import uuid4

from kunyu.agent import services as s
from kunyu.agent.commands.registry import CommandInvocation, CommandResult
from kunyu.agent.hooks import PreStepInvocation
from kunyu.agent.runtime.events import StepMessagePayload
from kunyu.agent.runtime.hooks import EnterStep, StepDecision
from kunyu.application.plan_mode import select_plan_mode
from kunyu.domain.agent_context import RunContextSource
from kunyu.persistence.commands import read_session_controls


def plan_policy(source: object) -> str:
    if not isinstance(source, RunContextSource):
        raise TypeError("Plan policy requires a run context.")
    if not source.controls.plan_active:
        return ""
    return (
        "Plan mode is active. Investigate and propose a concrete plan. "
        "Use read-only tools; do not execute writes or change persistent workspace data. "
        "Ask the user to review the plan and use /plan off before implementation."
    )


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


async def narrate_plan_selection(
    invocation: PreStepInvocation, next_handler: Callable[[], Awaitable[StepDecision]]
) -> StepDecision:
    decision = await next_handler()
    invocation.signal.throw_if_cancelled()
    if not isinstance(decision, EnterStep):
        return decision
    controls = read_session_controls(
        invocation.agent.ctx.require(s.DATABASE), invocation.agent.session_id
    )
    target = (
        controls.plan_active if controls.plan_pending is None else controls.plan_pending
    )
    if controls.plan_at_last_header in (None, target):
        return decision
    # The selection is consumed by the same committed admission event that
    # carries this notice. Rejected steps and retries do not consume it.
    text = (
        "The user switched this session to plan mode."
        if target
        else "The user switched this session back to the default mode."
    )
    return replace(
        decision,
        messages=(
            *decision.messages,
            StepMessagePayload(
                message_id=f"plan_{uuid4().hex}",
                content=text,
            ),
        ),
    )
