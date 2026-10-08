"""Validate auxiliary call boundaries before accepting their checkpoints."""

from dataclasses import asdict

from kunyu.agent.compaction_pressure import PressurePolicy, measure_pressure
from kunyu.agent.compaction_prompt import (
    COMPACTION_INSTRUCTION,
    SECTIONS,
    frame_summary,
)
from kunyu.agent.runtime.assistant_stream import expand_assistant_stream
from kunyu.agent.runtime.block_assembler import BlockAssembler
from kunyu.agent.runtime.content import ToolCallBlock, content_text, text_content
from kunyu.agent.runtime.events import (
    CommandRunEvent,
    CompactionFinishedEvent,
    CompactionSelectionEvent,
    CompactionStartedEvent,
    EventDraft,
    HistoryCompactedEvent,
    RequestHeaderEvent,
    RunCreatedEvent,
    RunTerminalEvent,
)
from kunyu.agent.runtime.message_snapshot import (
    require_balanced_tools,
    snapshot_message,
)
from kunyu.agent.runtime.models import ModelMessage, ModelRole
from kunyu.agent.token_estimate import estimate_message, estimate_messages


class CompactionProjection:
    def __init__(self) -> None:
        self.started: dict[str, CompactionStartedEvent] = {}
        self.finished: set[str] = set()
        self.selections: dict[str, CompactionSelectionEvent] = {}
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
                header is None
                or header.run_id != payload.source_run_id
                or header.payload.model_snapshot != payload.model_snapshot
            ):
                raise ValueError("Compaction requires the actual routed request.")
            if payload.trigger == "manual":
                if (
                    self.open_runs
                    or payload.owner_run_id is not None
                    or self.commands.get(payload.command_id) != "compact"
                    or payload.pressure is not None
                ):
                    raise ValueError(
                        "Manual compaction requires the actual idle command."
                    )
            elif (
                self.open_runs != {payload.owner_run_id}
                or payload.command_id is not None
                or (payload.trigger == "pressure") != (payload.pressure is not None)
            ):
                raise ValueError(
                    "Automatic compaction requires its single active turn owner."
                )
            if any(identity not in self.finished for identity in self.started):
                raise ValueError("A session cannot have concurrent compaction calls.")
            if payload.tools != tuple(header.payload.tools) or payload.messages[-1].get(
                "content"
            ) != [{"type": "text", "text": COMPACTION_INSTRUCTION}]:
                raise ValueError("The compaction instruction or tool schemas changed.")
            self.started[payload.compaction_id] = event
        elif isinstance(event, CompactionSelectionEvent):
            payload = event.payload
            started = self.started.get(payload.compaction_id)
            if (
                started is None
                or payload.compaction_id in self.selections
                or sequence != started.payload.through_sequence + 2
            ):
                raise ValueError(
                    "A selection requires one immediately preceding compaction start."
                )
            selected, retained = payload.selected_sequences, payload.retained_sequences
            combined = (*selected, *retained)
            if (
                tuple(sorted(set(combined))) != combined
                or payload.compact_through_sequence != selected[-1]
                or payload.compact_through_sequence > started.payload.through_sequence
            ):
                raise ValueError("Compaction selection boundaries are invalid.")
            header = self.headers[started.payload.request_sequence]
            prefix = payload.protected_messages
            protected = next(
                (
                    index
                    for index, message in enumerate(header.payload.messages)
                    if message["role"] != "system"
                    and snapshot_message(message).context_source != "workspace"
                ),
                len(header.payload.messages),
            )
            if (
                prefix != protected
                or started.payload.messages[:prefix]
                != tuple(header.payload.messages[:prefix])
                or prefix >= len(started.payload.messages) - 1
            ):
                raise ValueError(
                    "Selected compaction input does not preserve the routed prefix."
                )
            measured = estimate_messages(
                tuple(
                    snapshot_message(message)
                    for message in started.payload.messages[
                        payload.protected_messages : -1
                    ]
                )
            )
            selected_messages = tuple(
                snapshot_message(message)
                for message in started.payload.messages[payload.protected_messages : -1]
            )
            retained_messages = tuple(
                snapshot_message(message) for message in payload.retained_messages
            )
            require_balanced_tools(selected_messages)
            require_balanced_tools(retained_messages)
            if bool(retained_messages) != bool(payload.retained_sequences) or (
                payload.retention_tokens > 0
                and estimate_messages(retained_messages) < payload.retention_tokens
            ):
                raise ValueError("Retained history does not meet its declared budget.")
            if (
                measured != payload.estimated_selected_tokens
                or payload.retention_tokens
                != (
                    0
                    if started.payload.trigger == "context-overflow"
                    else started.payload.model_snapshot.retention_tokens
                )
            ):
                raise ValueError("Compaction selection measurements are inconsistent.")
            if started.payload.pressure is not None:
                pressure = started.payload.pressure
                actual = measure_pressure(
                    tuple(
                        snapshot_message(message)
                        for message in (
                            *started.payload.messages[:-1],
                            *payload.retained_messages,
                        )
                    ),
                    started.payload.tools,
                    started.payload.model_snapshot,
                    PressurePolicy(pressure.threshold_ratio, pressure.headroom_tokens),
                )
                if (
                    actual != pressure
                    or pressure.estimated_prompt_tokens < pressure.threshold_tokens
                ):
                    raise ValueError(
                        "Pressure compaction requires its measured routed threshold."
                    )
            self.selections[payload.compaction_id] = event
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
                selection = self.selections.get(payload.compaction_id)
                if sequence != started.payload.through_sequence + (
                    3 if selection is not None else 2
                ):
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
                if selection is not None:
                    tokens = estimate_message(
                        ModelMessage(
                            ModelRole.USER,
                            text_content(frame_summary(summary)),
                            context_source="compaction",
                        )
                    )
                    if tokens >= selection.payload.estimated_selected_tokens:
                        raise ValueError(
                            "A new checkpoint must reduce the selected context."
                        )
                else:
                    header = self.headers[started.payload.request_sequence]
                    if started.payload.messages[
                        : len(header.payload.messages)
                    ] != tuple(header.payload.messages):
                        raise ValueError(
                            "Compaction must preserve its original routed prefix."
                        )
                self.checkpoint = (
                    selection.payload.compact_through_sequence
                    if selection is not None
                    else started.payload.through_sequence,
                    frame_summary(summary),
                )

    def finish(self) -> None:
        if self.checkpoint is not None:
            raise ValueError("A successful compaction has no checkpoint.")
