"""Validate auxiliary call boundaries before accepting their checkpoints."""

from dataclasses import asdict

from kunyu.agent.compaction_prompt import (
    COMPACTION_INSTRUCTION,
    SECTIONS,
    frame_summary,
)
from kunyu.agent.runtime.assistant_stream import expand_assistant_stream
from kunyu.agent.runtime.block_assembler import BlockAssembler
from kunyu.agent.runtime.content import ToolCallBlock, content_text
from kunyu.agent.runtime.events import (
    CommandRunEvent,
    CompactionFinishedEvent,
    CompactionStartedEvent,
    EventDraft,
    HistoryCompactedEvent,
    RequestHeaderEvent,
    RunCreatedEvent,
    RunTerminalEvent,
)


class CompactionProjection:
    def __init__(self) -> None:
        self.started: dict[str, CompactionStartedEvent] = {}
        self.finished: set[str] = set()
        self.checkpoint: tuple[int, str] | None = None
        self.headers: dict[int, RequestHeaderEvent] = {}
        self.commands: dict[str, str] = {}
        self.open_runs: set[str] = set()

    def accept(self, event: EventDraft, sequence: int) -> None:
        if isinstance(event, RunCreatedEvent):
            self.open_runs.add(event.run_id)
        elif isinstance(event, RunTerminalEvent):
            self.open_runs.discard(event.run_id)
        elif isinstance(event, RequestHeaderEvent):
            self.headers[sequence] = event
        elif isinstance(event, CommandRunEvent):
            self.commands[event.payload.command_id] = event.payload.name
        if self.checkpoint is not None:
            if (
                not isinstance(event, HistoryCompactedEvent)
                or (event.payload.through_sequence, event.payload.summary)
                != self.checkpoint
            ):
                raise ValueError(
                    "A successful compaction must publish its exact checkpoint next."
                )
            self.checkpoint = None
        if isinstance(event, CompactionStartedEvent):
            payload = event.payload
            if (
                payload.compaction_id in self.started
                or payload.through_sequence != sequence - 1
                or payload.request_sequence > payload.through_sequence
            ):
                raise ValueError("The compaction request boundary is invalid.")
            header = self.headers.get(payload.request_sequence)
            if (
                self.open_runs
                or self.commands.get(payload.command_id) != "compact"
                or header is None
                or header.run_id != payload.source_run_id
                or header.payload.model_snapshot != payload.model_snapshot
            ):
                raise ValueError("Compaction requires the actual idle routed request.")
            if (
                payload.tools != tuple(header.payload.tools)
                or payload.messages[: len(header.payload.messages)]
                != tuple(header.payload.messages)
                or payload.messages[-1].get("content")
                != [{"type": "text", "text": COMPACTION_INSTRUCTION}]
            ):
                raise ValueError(
                    "The compaction input does not preserve its request prefix."
                )
            self.started[payload.compaction_id] = event
        elif isinstance(event, CompactionFinishedEvent):
            payload = event.payload
            started = self.started.get(payload.compaction_id)
            if started is None or payload.compaction_id in self.finished:
                raise ValueError("A compaction finish requires one unmatched start.")
            assembler = BlockAssembler()
            outputs = expand_assistant_stream(payload.stream)
            for index, output in enumerate(outputs):
                try:
                    assembler.push(output.output)
                except (TypeError, ValueError):
                    if payload.outcome != "failed" or index != len(outputs) - 1:
                        raise
            expected = assembler.blocks(interrupted=assembler.finish is None)
            if (
                payload.blocks != expected
                or payload.replay_state != assembler.replay_state
                or payload.finish_reason
                != (assembler.finish.value if assembler.finish is not None else None)
            ):
                raise ValueError(
                    "Compaction output does not match its recorded stream."
                )
            if (payload.usage.model_dump() if payload.usage is not None else None) != (
                asdict(assembler.usage) if assembler.usage is not None else None
            ):
                raise ValueError(
                    "Compaction token usage differs from its recorded stream."
                )
            if payload.outcome != "completed" and not payload.error_code:
                raise ValueError("Unsuccessful compaction requires an error code.")
            self.finished.add(payload.compaction_id)
            if payload.outcome == "completed":
                if sequence != started.payload.through_sequence + 2:
                    raise ValueError("Compaction cannot replace changed history.")
                summary = content_text(payload.blocks).strip()
                if (
                    payload.finish_reason != "stop"
                    or payload.error_code is not None
                    or not summary
                    or any(isinstance(block, ToolCallBlock) for block in payload.blocks)
                ):
                    raise ValueError(
                        "Only a complete text checkpoint can replace history."
                    )
                if [
                    line for line in summary.splitlines() if line.startswith("## ")
                ] != [f"## {section}" for section in SECTIONS]:
                    raise ValueError(
                        "A checkpoint must preserve its required sections."
                    )
                self.checkpoint = (
                    started.payload.through_sequence,
                    frame_summary(summary),
                )

    def finish(self) -> None:
        if self.checkpoint is not None:
            raise ValueError("A successful compaction has no checkpoint.")
