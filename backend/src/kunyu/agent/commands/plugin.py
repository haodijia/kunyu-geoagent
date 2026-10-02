"""Compose only commands backed by installed Kunyu capabilities."""

from dataclasses import replace
from datetime import UTC, datetime

from kunyu.agent import services as s
from kunyu.agent.commands.compaction import compact_history
from kunyu.agent.commands.registry import (
    CommandDefinition,
    CommandInvocation,
    CommandRegistry,
    CommandResult,
)
from kunyu.agent.runtime.context import PromptSection
from kunyu.agent.runtime.events import (
    EventBatch,
    FeedbackRecordedEvent,
    FeedbackRecordedPayload,
    PermissionChangedEvent,
    PermissionChangedPayload,
    PlanChangedEvent,
    PlanChangedPayload,
)
from kunyu.agent.scope import Context
from kunyu.domain.agent_context import RunContextSource
from kunyu.persistence.commands import read_session_controls


def _plan_policy(source: object) -> str:
    if not isinstance(source, RunContextSource):
        raise TypeError("Plan policy requires a run context.")
    if not source.controls.plan_active:
        return ""
    return (
        "Plan mode is active. Investigate and propose a concrete plan. "
        "Use read-only tools; do not execute writes or change persistent workspace data. "
        "Ask the user to review the plan and use /plan off before implementation."
    )


async def _plan(invocation: CommandInvocation) -> CommandResult:
    agent = invocation.agent
    text = invocation.raw_input.strip()
    active = text != "off"
    if text and active and invocation.message is None:
        return CommandResult("error", "请先选择可用模型，再提交计划需求。")
    agent.ctx.require(s.PROJECTIONS).commit(
        EventBatch(
            agent.session_id,
            None,
            (
                PlanChangedEvent(
                    session_id=agent.session_id,
                    event_type="plan/changed",
                    payload=PlanChangedPayload(active=active),
                    occurred_at=datetime.now(UTC),
                ),
            ),
        )
    )
    if text and active:
        assert invocation.message is not None
        request = replace(invocation.message, content=text)
        await agent.steer(request)
    return CommandResult(
        "success",
        "已进入计划模式，从下一个模型步骤起生效。使用 /plan off 退出。"
        if active
        else "已退出计划模式，从下一个模型步骤起生效。",
    )


async def _permission(invocation: CommandInvocation) -> CommandResult:
    agent = invocation.agent
    preset = invocation.raw_input.strip()
    if not preset:
        current = read_session_controls(
            agent.ctx.require(s.DATABASE), agent.session_id
        ).permission
        return CommandResult(
            "success",
            f"当前权限：{current}。可选：read-only / workspace-write（写入需确认）。",
        )
    if preset not in {"read-only", "workspace-write"}:
        return CommandResult(
            "error",
            "当前工具执行器支持 read-only 和 workspace-write；未提供 shell 或文件系统沙箱预设。",
        )
    agent.ctx.require(s.PROJECTIONS).commit(
        EventBatch(
            agent.session_id,
            None,
            (
                PermissionChangedEvent(
                    session_id=agent.session_id,
                    event_type="permission/changed",
                    payload=PermissionChangedPayload(preset=preset),
                    occurred_at=datetime.now(UTC),
                ),
            ),
        )
    )
    return CommandResult("success", f"已切换权限：{preset}，后续工具调用按此策略执行。")


async def _feedback(invocation: CommandInvocation) -> CommandResult:
    text = invocation.raw_input.strip()
    if not text:
        return CommandResult("error", "用法：/feedback <反馈内容>")
    agent = invocation.agent
    agent.ctx.require(s.PROJECTIONS).commit(
        EventBatch(
            agent.session_id,
            None,
            (
                FeedbackRecordedEvent(
                    session_id=agent.session_id,
                    event_type="feedback/record",
                    payload=FeedbackRecordedPayload(text=text),
                    occurred_at=datetime.now(UTC),
                ),
            ),
        )
    )
    return CommandResult("success", "反馈已记录在当前会话日志中。")


async def _export(invocation: CommandInvocation) -> CommandResult:
    if invocation.raw_input.strip():
        return CommandResult("error", "/export 不接受参数。")
    return CommandResult("success", "会话日志已准备下载。")


class CommandsPlugin:
    name = "commands"
    requires = (
        s.PROJECTIONS,
        s.EVENTS,
        s.DATABASE,
        s.CONTEXTS,
        s.EXECUTIONS,
        s.MODEL,
        s.PROMPTS,
    )
    provides = (s.COMMANDS,)

    async def apply(self, context: Context) -> None:
        registry = CommandRegistry()
        context.provide(s.COMMANDS, registry)
        definitions = (
            CommandDefinition(
                "kunyu/plan-mode", "plan", "进入或退出计划模式", _plan, "[off|计划需求]"
            ),
            CommandDefinition(
                "kunyu/permission-presets",
                "permission",
                "切换 Agent 工具执行权限",
                _permission,
                "[read-only|workspace-write]",
            ),
            CommandDefinition(
                "kunyu/command-compact",
                "compact",
                "压缩已完成的对话历史",
                compact_history,
            ),
            CommandDefinition(
                "kunyu/command-feedback",
                "feedback",
                "记录当前会话反馈",
                _feedback,
                "<反馈内容>",
                False,
            ),
            CommandDefinition(
                "kunyu/session-log-export",
                "export",
                "下载当前会话的完整日志 ZIP",
                _export,
            ),
        )
        for definition in definitions:
            registry.register(context, definition)
        context.require(s.PROMPTS).register(
            context, PromptSection("plan:policy", 30, _plan_policy)
        )
