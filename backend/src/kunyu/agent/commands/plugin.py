"""Compose only commands backed by installed Kunyu capabilities."""

from datetime import UTC, datetime

from kunyu.agent import services as s
from kunyu.agent.commands.compaction import compact_history
from kunyu.agent.commands.plan import narrate_plan_selection, plan_command, plan_policy
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
)
from kunyu.agent.scope import Context
from kunyu.persistence.commands import read_session_controls


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
        s.HOOKS,
    )
    provides = (s.COMMANDS,)

    async def apply(self, context: Context) -> None:
        registry = CommandRegistry()
        context.provide(s.COMMANDS, registry)
        definitions = (
            CommandDefinition(
                "kunyu/plan-mode",
                "plan",
                "进入或退出计划模式",
                plan_command,
                "[off|计划需求]",
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
            context, PromptSection("plan:policy", 30, plan_policy)
        )

        context.require(s.HOOKS).pre_step.register(
            context, "plan:selection", narrate_plan_selection
        )
