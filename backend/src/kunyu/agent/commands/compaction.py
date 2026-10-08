"""Recorded manual compaction using the last actual request as a warm prefix."""

import asyncio
import logging
from dataclasses import asdict, replace
from datetime import UTC, datetime
from time import monotonic
from uuid import uuid4

from kunyu.agent import services as s
from kunyu.agent.commands.registry import CommandInvocation, CommandResult
from kunyu.agent.compaction_prompt import (
    COMPACTION_INSTRUCTION,
    SECTIONS,
    frame_summary,
)
from kunyu.agent.compaction_selection import select_prefix
from kunyu.agent.context import build_model_history, build_model_history_nodes
from kunyu.agent.runtime.assistant_stream import AssistantStreamAccumulator
from kunyu.agent.runtime.block_assembler import BlockAssembler
from kunyu.agent.runtime.content import ToolCallBlock, content_text, text_content
from kunyu.agent.runtime.events import (
    TERMINAL_RUN_STATES,
    CompactionFinishedEvent,
    CompactionFinishedPayload,
    CompactionSelectionEvent,
    CompactionSelectionPayload,
    CompactionStartedEvent,
    CompactionStartedPayload,
    CompactionUsage,
    EventBatch,
    HistoryCompactedEvent,
    HistoryCompactedPayload,
    RequestHeaderPayload,
)
from kunyu.agent.runtime.message_snapshot import (
    message_snapshot,
    require_balanced_tools,
    snapshot_message,
)
from kunyu.agent.runtime.models import (
    ModelAdapterError,
    ModelFinishReason,
    ModelMessage,
    ModelRequest,
    ModelRole,
)
from kunyu.agent.runtime.session_reducer import reduce_session
from kunyu.agent.runtime.tools import ToolSchema
from kunyu.agent.token_estimate import estimate_message
from kunyu.persistence.models import SessionEventRecord
from sqlalchemy import func, select, text

logger = logging.getLogger(__name__)
MAX_CHECKPOINT_CODEPOINTS = 65536


async def compact_history(invocation: CommandInvocation) -> CommandResult:
    agent = invocation.agent
    if invocation.raw_input.strip():
        return CommandResult("error", "/compact 不接受参数。")
    if any(turn.run.state not in TERMINAL_RUN_STATES for turn in agent.turns()):
        return CommandResult("error", "当前 Agent 尚未空闲，不能压缩历史。")
    if not agent.turns():
        return CommandResult("success", "当前没有可压缩的对话历史。")
    latest = agent.turns()[-1].run.id
    events = await agent.ctx.require(s.EVENTS).list_after(agent.session_id, 0)
    source = agent.ctx.require(s.CONTEXTS).get(latest)
    if source is None or source.journal_revision != events[-1].sequence:
        return CommandResult("error", "会话历史已变化，请重新执行压缩。")
    if source.reduced_session.next_turn:
        return CommandResult("error", "请先处理待发送消息，再压缩历史。")
    header_event = next(
        (
            event
            for event in reversed(events)
            if event.event_type == "request.header" and event.run_id == latest
        ),
        None,
    )
    if header_event is None:
        return CommandResult("error", "当前轮次尚无实际模型请求，无法压缩。")
    if header_event.sequence <= source.controls.compacted_through:
        return CommandResult("success", "当前历史已经压缩，无需重复请求模型。")
    header = RequestHeaderPayload.model_validate(header_event.payload)
    reduced = reduce_session(events[: header_event.sequence])
    prior = replace(
        source,
        run=next(run for run in reduced.runs if run.run_id == latest),
        reduced_session=reduced,
        controls=reduced.controls,
        injected_context=tuple(
            item
            for item in source.injected_context
            if item.sequence <= header_event.sequence
        ),
    )
    before, history = build_model_history(prior), build_model_history(source)
    if history[: len(before)] != before:
        return CommandResult(
            "error", "历史前缀已变化，无法复用当前模型请求，请先完成下一轮对话。"
        )
    selection = select_prefix(
        build_model_history_nodes(source), header.model_snapshot.retention_tokens
    )
    if selection is None:
        return CommandResult("success", "当前历史已在最近保留范围内，无需请求压缩。")
    prefix = tuple(snapshot_message(message) for message in header.messages)
    protected = len(prefix) - len(before)
    if protected < 0 or prefix[protected:] != before:
        return CommandResult("error", "原请求历史边界不一致，无法复用前缀。")
    selected = tuple(
        message for node in selection.selected for message in node.messages
    )
    retained = tuple(
        message for node in selection.retained for message in node.messages
    )
    require_balanced_tools(selected)
    require_balanced_tools(retained)
    messages = (
        *prefix[:protected],
        *selected,
        ModelMessage(
            ModelRole.USER,
            text_content(COMPACTION_INSTRUCTION),
            context_source="compaction-instruction",
        ),
    )
    schemas = tuple(
        ToolSchema(
            name=item["name"],
            description=item["description"],
            parameters=item["parameters"],
        )
        for item in header.tools
    )
    request = ModelRequest(
        run_id=latest,
        adapter_config=agent.ctx.require(s.EXECUTIONS).prepare(header.model_snapshot),
        model_id=header.model_snapshot.model_id,
        messages=messages,
        tools=schemas,
        max_output_tokens=header.model_snapshot.max_output_tokens,
        reasoning_effort=header.model_snapshot.reasoning_effort,
    )
    identity = str(uuid4())
    payload = CompactionStartedPayload(
        compaction_id=identity,
        command_id=invocation.command_id,
        source_run_id=latest,
        through_sequence=source.journal_revision,
        request_sequence=header_event.sequence,
        model_snapshot=header.model_snapshot,
        messages=tuple(message_snapshot(message) for message in messages),
        tools=tuple(header.tools),
    )
    selected_payload = CompactionSelectionPayload(
        compaction_id=identity,
        compact_through_sequence=selection.selected[-1].sequence,
        selected_sequences=tuple(node.sequence for node in selection.selected),
        retained_sequences=tuple(node.sequence for node in selection.retained),
        retained_messages=tuple(message_snapshot(message) for message in retained),
        protected_messages=protected,
        retention_tokens=header.model_snapshot.retention_tokens,
        estimated_selected_tokens=selection.estimated_tokens,
    )
    database, projections = (
        agent.ctx.require(s.DATABASE),
        agent.ctx.require(s.PROJECTIONS),
    )
    with database.sessions() as tx:
        tx.execute(text("BEGIN IMMEDIATE"))
        current = tx.scalar(
            select(func.max(SessionEventRecord.sequence)).where(
                SessionEventRecord.session_id == agent.session_id
            )
        )
        if current != source.journal_revision:
            return CommandResult("error", "会话历史已变化，请重新执行压缩。")
        started = projections.commit_in_transaction(
            tx,
            EventBatch(
                agent.session_id,
                None,
                (
                    CompactionStartedEvent(
                        session_id=agent.session_id,
                        event_type="compaction/start",
                        payload=payload,
                        occurred_at=datetime.now(UTC),
                    ),
                    CompactionSelectionEvent(
                        session_id=agent.session_id,
                        event_type="compaction/selection",
                        payload=selected_payload,
                        occurred_at=datetime.now(UTC),
                    ),
                ),
            ),
        )[-1]
        tx.commit()
    assembler, stream, began = (
        BlockAssembler(),
        AssistantStreamAccumulator(),
        monotonic(),
    )
    try:
        async with asyncio.timeout(120):
            async for output in agent.ctx.require(s.MODEL).stream(request):
                stream.push(output, round((monotonic() - began) * 1000))
                assembler.push(output)
                if assembler.output_codepoints > MAX_CHECKPOINT_CODEPOINTS:
                    raise ValueError("Checkpoint output exceeded its text limit.")
        summary = content_text(assembler.blocks()).strip()
        if (
            assembler.finish is not ModelFinishReason.STOP
            or any(isinstance(block, ToolCallBlock) for block in assembler.blocks())
            or not summary
        ):
            raise ValueError("Compaction did not return complete text.")
        headings = [line for line in summary.splitlines() if line.startswith("## ")]
        if headings != [f"## {section}" for section in SECTIONS]:
            raise ValueError(
                "Compaction did not return the required checkpoint sections."
            )
    except asyncio.CancelledError:
        _finish(
            projections,
            agent.session_id,
            identity,
            assembler,
            stream,
            began,
            "cancelled",
            "COMPACTION_CANCELLED",
        )
        raise
    except Exception as error:
        logger.exception("Compaction failed for session %s", agent.session_id)
        code = (
            error.code.value
            if isinstance(error, ModelAdapterError)
            else "COMPACTION_TIMEOUT"
            if isinstance(error, TimeoutError)
            else "COMPACTION_INVALID_OUTPUT"
        )
        _finish(
            projections,
            agent.session_id,
            identity,
            assembler,
            stream,
            began,
            "failed",
            code,
        )
        return CommandResult("error", "模型未生成完整压缩摘要，原历史已保留，请重试。")
    replacement = ModelMessage(
        ModelRole.USER,
        text_content(frame_summary(summary)),
        context_source="compaction",
    )
    if estimate_message(replacement) >= selection.estimated_tokens:
        _finish(
            projections,
            agent.session_id,
            identity,
            assembler,
            stream,
            began,
            "failed",
            "COMPACTION_NOT_SMALLER",
        )
        return CommandResult("error", "摘要未缩小所选上下文，原历史保留。")
    with database.sessions() as tx:
        tx.execute(text("BEGIN IMMEDIATE"))
        current = tx.scalar(
            select(func.max(SessionEventRecord.sequence)).where(
                SessionEventRecord.session_id == agent.session_id
            )
        )
        if current != started.sequence:
            projections.commit_in_transaction(
                tx,
                EventBatch(
                    agent.session_id,
                    None,
                    (
                        _finished_event(
                            agent.session_id,
                            identity,
                            assembler,
                            stream,
                            began,
                            "stale",
                            "COMPACTION_HISTORY_CHANGED",
                        ),
                    ),
                ),
            )
            tx.commit()
            return CommandResult(
                "error", "压缩期间会话历史发生变化，原历史已保留，请重新执行。"
            )
        saved = projections.commit_in_transaction(
            tx,
            EventBatch(
                agent.session_id,
                None,
                (
                    _finished_event(
                        agent.session_id,
                        identity,
                        assembler,
                        stream,
                        began,
                        "completed",
                        None,
                    ),
                    HistoryCompactedEvent(
                        session_id=agent.session_id,
                        event_type="history/compacted",
                        payload=HistoryCompactedPayload(
                            summary=frame_summary(summary),
                            through_sequence=selected_payload.compact_through_sequence,
                        ),
                        occurred_at=datetime.now(UTC),
                    ),
                ),
            ),
        )
        tx.commit()
    return CommandResult(
        "success",
        f"已压缩 {len(history)} 条模型历史；原始会话日志保留。",
        saved[-1].sequence,
    )


def _finished_event(session_id, identity, assembler, stream, began, outcome, code):
    return CompactionFinishedEvent(
        session_id=session_id,
        event_type="compaction/end",
        occurred_at=datetime.now(UTC),
        payload=CompactionFinishedPayload(
            compaction_id=identity,
            outcome=outcome,
            error_code=code,
            finish_reason=assembler.finish.value
            if assembler.finish is not None
            else None,
            blocks=assembler.blocks(interrupted=assembler.finish is None),
            stream=stream.snapshot(),
            replay_state=assembler.replay_state,
            usage=CompactionUsage(**asdict(assembler.usage))
            if assembler.usage is not None
            else None,
            active_milliseconds=max(0, round((monotonic() - began) * 1000)),
        ),
    )


def _finish(
    projections, session_id, identity, assembler, stream, began, outcome, code
) -> None:
    projections.commit(
        EventBatch(
            session_id,
            None,
            (
                _finished_event(
                    session_id, identity, assembler, stream, began, outcome, code
                ),
            ),
        )
    )
