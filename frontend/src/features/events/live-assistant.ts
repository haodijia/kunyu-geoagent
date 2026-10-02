import type { SessionEvent } from "./api";
import type { TrajectoryEventProjection } from "./projection";
import {
  assistantStreamChunkCount,
  parseAssistantStream,
  parseStreamChunk,
  type AssistantStreamRecord,
  type StreamChunk,
} from "./assistant-stream";

export interface ActiveAssistant {
  readonly attempt_id: string;
  readonly run_id: string;
  readonly step: number;
  readonly attempt: number;
  readonly started_after_sequence: number;
  readonly next_index: number;
  readonly stream: readonly AssistantStreamRecord[];
}
export interface AssistantBaseline {
  readonly revision: number;
  readonly active_attempt: ActiveAssistant | null;
}
export type AssistantFrame =
  | {
      readonly type: "start";
      readonly attempt_id: string;
      readonly revision: number;
      readonly run_id: string;
      readonly step: number;
      readonly attempt: number;
      readonly started_after_sequence: number;
    }
  | {
      readonly type: "chunk";
      readonly attempt_id: string;
      readonly revision: number;
      readonly index: number;
      readonly time: number;
      readonly chunk: StreamChunk;
    }
  | {
      readonly type: "end";
      readonly attempt_id: string;
      readonly revision: number;
      readonly index: number;
      readonly outcome:
        | {
            readonly kind: "committed";
            readonly event_type: "model.attempt.finished";
            readonly sequence: number;
            readonly outcome: string;
          }
        | { readonly kind: "abandoned" };
    };

export function parseAssistantBaseline(value: unknown): AssistantBaseline {
  if (
    !object(value) ||
    !index(value.revision) ||
    !(value.active_attempt === null || object(value.active_attempt))
  )
    throw new Error("Invalid assistant baseline.");
  const active = value.active_attempt;
  if (active !== null) {
    if (
      !identity(active.attempt_id) ||
      !identity(active.run_id) ||
      !index(active.step) ||
      !index(active.attempt) ||
      !index(active.started_after_sequence) ||
      !index(active.next_index)
    )
      throw new Error("Invalid active assistant identity.");
    const stream = parseAssistantStream(active.stream);
    if (assistantStreamChunkCount(stream) !== active.next_index)
      throw new Error("Assistant baseline chunk count differs from its index.");
  }
  return value as unknown as AssistantBaseline;
}
export function parseAssistantFrame(value: unknown): AssistantFrame {
  if (
    !object(value) ||
    !identity(value.attempt_id) ||
    !index(value.revision) ||
    value.revision < 1
  )
    throw new Error("Invalid assistant frame identity.");
  if (value.type === "start") {
    if (
      !identity(value.run_id) ||
      !index(value.step) ||
      !index(value.attempt) ||
      !index(value.started_after_sequence)
    )
      throw new Error("Invalid assistant start.");
  } else if (value.type === "chunk") {
    if (!index(value.index) || !Number.isSafeInteger(value.time))
      throw new Error("Invalid assistant chunk position.");
    parseStreamChunk(value.chunk);
  } else if (value.type === "end") {
    const outcome = value.outcome;
    if (
      !index(value.index) ||
      !object(outcome) ||
      !(
        outcome.kind === "abandoned" ||
        (outcome.kind === "committed" &&
          outcome.event_type === "model.attempt.finished" &&
          index(outcome.sequence) &&
          typeof outcome.outcome === "string")
      )
    )
      throw new Error("Invalid assistant end.");
  } else throw new Error("Unknown assistant frame type.");
  return value as unknown as AssistantFrame;
}

/** Transient output exists until its named durable settlement and dense end arrive. */
export class LiveAssistantStream {
  private revision = 0;
  private active: ActiveAssistant | null = null;
  private settlement: SessionEvent | null = null;
  replace(baseline: AssistantBaseline, cursor: number): ActiveAssistant | null {
    if (
      baseline.active_attempt !== null &&
      baseline.active_attempt.started_after_sequence > cursor
    )
      throw new Error("Assistant baseline starts beyond the durable cursor.");
    this.revision = baseline.revision;
    this.active = baseline.active_attempt;
    this.settlement = null;
    return this.active;
  }
  durable(event: SessionEvent): void {
    const active = this.active;
    if (
      active !== null &&
      event.event_type === "model.attempt.finished" &&
      event.payload.message_id === active.attempt_id
    ) {
      if (
        event.run_id !== active.run_id ||
        event.payload.step !== active.step ||
        event.payload.attempt !== active.attempt ||
        this.settlement !== null
      )
        throw new Error(
          "Assistant settlement identity differs from its active attempt.",
        );
      this.settlement = event;
    }
  }
  accept(frame: AssistantFrame, cursor: number): ActiveAssistant | null {
    if (frame.revision !== this.revision + 1)
      throw new Error("Assistant stream revision gap; reconnect required.");
    this.revision = frame.revision;
    if (frame.type === "start") {
      if (this.active !== null || frame.started_after_sequence > cursor)
        throw new Error(
          "Assistant stream start requires a settled predecessor and durable boundary.",
        );
      this.active = { ...frame, next_index: 0, stream: [] };
      this.settlement = null;
    } else {
      const active = this.active;
      if (
        active === null ||
        active.attempt_id !== frame.attempt_id ||
        active.next_index !== frame.index
      )
        throw new Error(
          "Assistant stream chunk index or identity gap; reconnect required.",
        );
      if (frame.type === "chunk")
        this.active = {
          ...active,
          next_index: active.next_index + 1,
          stream: appendChunk(active.stream, frame.time, frame.chunk),
        };
      else {
        if (
          frame.outcome.kind === "committed" &&
          (this.settlement === null ||
            this.settlement.sequence !== frame.outcome.sequence ||
            this.settlement.payload.outcome !== frame.outcome.outcome)
        )
          throw new Error(
            "Assistant end requires its named durable settlement.",
          );
        if (frame.outcome.kind === "abandoned" && this.settlement !== null)
          throw new Error("Committed assistant cannot be abandoned.");
        this.active = null;
        this.settlement = null;
      }
    }
    return this.active;
  }
}

function appendChunk(
  stream: readonly AssistantStreamRecord[],
  time: number,
  chunk: StreamChunk,
): readonly AssistantStreamRecord[] {
  const previous = stream.at(-1);
  if (chunk.type === "text-delta" || chunk.type === "reasoning-delta") {
    const type =
      chunk.type === "text-delta" ? "text-chunks" : "reasoning-chunks";
    if (previous?.type === type && previous.index === chunk.index) {
      const lastTime = previous.dt.reduce(
        (current, gap) => current + gap,
        previous.time0,
      );
      const gap = time - lastTime;
      if (Number.isSafeInteger(gap))
        return [
          ...stream.slice(0, -1),
          {
            ...previous,
            dt: [...previous.dt, gap],
            texts: [...previous.texts, chunk.text],
          },
        ];
    }
    return [
      ...stream,
      { type, time0: time, index: chunk.index, dt: [], texts: [chunk.text] },
    ];
  }
  return [...stream, { type: "chunk", time, chunk }];
}

export function* timedChunks(
  stream: readonly AssistantStreamRecord[],
): Generator<{ time: number; chunk: StreamChunk }> {
  for (const record of stream) {
    if (record.type === "chunk") {
      yield { time: record.time, chunk: record.chunk };
      continue;
    }
    const members =
      record.type === "tool-call-chunks" ? record.args : record.texts;
    let time = record.time0;
    for (let index = 0; index < members.length; index++) {
      if (index > 0) time += record.dt[index - 1]!;
      yield {
        time,
        chunk:
          record.type === "tool-call-chunks"
            ? {
                type: "tool-call-delta",
                index: record.index,
                id: record.id,
                name: record.name,
                arguments_delta: members[index]!,
              }
            : {
                type:
                  record.type === "text-chunks"
                    ? "text-delta"
                    : "reasoning-delta",
                index: record.index,
                text: members[index]!,
              },
      };
    }
  }
}

export interface GeneratingTool {
  readonly index: number;
  readonly id: string;
  readonly name: string | null;
  readonly arguments: string;
}
export function assistantOutputLimit(
  active: ActiveAssistant,
  maximum: number,
  records: readonly TrajectoryEventProjection[],
): number {
  const used = records.reduce(
    (count, record) =>
      record.runId === active.run_id &&
      record.messageId !== active.attempt_id &&
      (record.eventType === "message.assistant.delta" ||
        record.eventType === "message.assistant.reasoning.delta") &&
      typeof record.payload.text === "string"
        ? count + Array.from(record.payload.text).length
        : count,
    0,
  );
  return Math.max(0, maximum - used);
}
export function assistantPresentation(
  active: ActiveAssistant,
  outputLimit: number,
) {
  let remaining = outputLimit,
    text = "",
    reasoning = "";
  let reasoningStarted: number | null = null,
    reasoningFinished: number | null = null;
  const tools = new Map<number, GeneratingTool>();
  for (const { time, chunk } of timedChunks(active.stream)) {
    if (chunk.type === "text-delta" || chunk.type === "reasoning-delta") {
      const visible = Array.from(chunk.text).slice(0, remaining).join("");
      remaining -= Array.from(visible).length;
      if (chunk.type === "text-delta") {
        text += visible;
        if (
          visible !== "" &&
          reasoningStarted !== null &&
          reasoningFinished === null
        )
          reasoningFinished = time;
      } else {
        reasoning += visible;
        if (visible !== "" && reasoningStarted === null)
          reasoningStarted = time;
      }
    } else if (chunk.type === "tool-call-delta") {
      const previous = tools.get(chunk.index);
      tools.set(chunk.index, {
        index: chunk.index,
        id: chunk.id,
        name: chunk.name === null ? (previous?.name ?? null) : chunk.name,
        arguments: (previous?.arguments ?? "") + chunk.arguments_delta,
      });
      if (
        (chunk.name !== null || chunk.arguments_delta !== "") &&
        reasoningStarted !== null &&
        reasoningFinished === null
      )
        reasoningFinished = time;
    }
  }
  return {
    text,
    reasoning:
      reasoningStarted === null
        ? null
        : {
            text: reasoning,
            startedAt: new Date(reasoningStarted).toISOString(),
            finishedAt:
              reasoningFinished === null
                ? null
                : new Date(reasoningFinished).toISOString(),
          },
    tools: [...tools.values()].sort((left, right) => left.index - right.index),
  };
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function identity(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}
function index(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
