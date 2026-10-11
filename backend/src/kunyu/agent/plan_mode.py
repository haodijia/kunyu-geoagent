"""Plan prompt and narration at accepted model-step boundaries."""

from collections.abc import Awaitable, Callable
from dataclasses import replace
from uuid import uuid4

from kunyu.agent import services as s
from kunyu.agent.hooks import PreStepInvocation
from kunyu.agent.prompt_files import prompt_text, read_prompt
from kunyu.agent.runtime.events import StepMessagePayload
from kunyu.agent.runtime.hooks import EnterStep, StepDecision
from kunyu.domain.agent_context import RunContextSource
from kunyu.persistence.commands import read_session_controls


def plan_policy(source: object) -> str:
    if not isinstance(source, RunContextSource):
        raise TypeError("Plan policy requires a run context.")
    if not source.controls.plan_active:
        return ""
    return plan_guidance()


def plan_guidance() -> str:
    return read_prompt("plan.md")


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
    if not controls.plan_narrate or controls.plan_at_last_header in (None, target):
        return decision
    # The selection is consumed by the same committed admission event that
    # carries this notice. Rejected steps and retries do not consume it.
    text = prompt_text("context.yaml", "plan_entered" if target else "plan_exited")
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
