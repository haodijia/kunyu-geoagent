import type { TrajectoryEventProjection } from "@/features/events/projection/events";
import {
  assistantStreamFirstTokenTime,
  parseAssistantStream,
  parseStreamOrigin,
} from "@/features/events/stream/assistant-stream";
import {
  contentText,
  parseContentBlocks,
} from "@/features/events/stream/content-blocks";
import { streamPresentation } from "@/features/events/stream/stream-presentation";
import type { RecordContext } from "@/features/events/trajectory/records/context";
import {
  baseRecord,
  integerValue,
  nullableInteger,
  stringValue,
  timestamp,
  turnFor,
} from "@/features/events/trajectory/records/shared";
import type {
  TrajectoryRecord,
  TrajectoryUsage,
} from "@/features/events/trajectory/trajectory-model";
import { zhCN } from "@/locales/zh-CN";

export function userRecord(
  events: readonly TrajectoryEventProjection[],
  context: RecordContext,
): TrajectoryRecord {
  const first = events[0]!;
  const message = context.messages.get(first.entityId);
  const content =
    message?.role === "user"
      ? [message.content, ...message.attachments.map((ref) => ref.name)]
          .filter(Boolean)
          .join(" · ")
      : (stringValue(first.payload.content) ?? "");
  return baseRecord(events, {
    turn: context.messageTurns.get(first.entityId) ?? null,
    text: content,
    searchText: content,
    status: "completed",
    completedAt: first.occurredAt,
    startedAt: first.occurredAt,
    isError: false,
    source: { role: "user", message_id: first.entityId, run_id: first.runId },
    input:
      message?.role === "user"
        ? { content: message.content, attachments: message.attachments }
        : content,
    output: null,
  });
}

export function assistantRecord(
  events: readonly TrajectoryEventProjection[],
  context: RecordContext,
): TrajectoryRecord {
  const first = events[0]!;
  const started = events.find(
    (event) => event.eventType === "message.assistant.started",
  );
  const completed = [...events]
    .reverse()
    .find(
      (event) =>
        event.eventType === "model.attempt.finished" ||
        event.eventType === "message.assistant.completed",
    );
  const attemptFinished = [...events]
    .reverse()
    .find((event) => event.eventType === "model.attempt.finished");
  const messageId =
    events.find((event) => event.messageId !== null)?.messageId ?? null;
  const message =
    messageId === null ? undefined : context.messages.get(messageId);
  const run = first.runId === null ? undefined : context.runs.get(first.runId);
  const live =
    context.activeAssistant?.attempt_id === messageId
      ? context.activeAssistant
      : null;
  const prefix =
    live !== null && run !== undefined ? streamPresentation(live.stream) : null;
  const content =
    prefix !== null
      ? prefix.text
      : attemptFinished !== undefined
        ? contentText(parseContentBlocks(attemptFinished.payload.blocks))
        : message?.role === "assistant"
          ? message.content
          : reconstructAssistantText(events);
  const finishReason = events.find(
    (event) => event.eventType === "message.assistant.completed",
  )?.payload.finish_reason;
  const outcome = stringValue(attemptFinished?.payload.outcome);
  const status =
    message?.role === "assistant"
      ? message.status
      : outcome === "error" ||
          outcome === "length" ||
          outcome === "content_filter"
        ? "failed"
        : completed === undefined
          ? "streaming"
          : "completed";
  const step = integerValue(first.payload.step);
  const attempt = integerValue(first.payload.attempt);
  const startTime = timestamp(started?.occurredAt);
  const stream =
    attemptFinished === undefined
      ? (live?.stream ?? null)
      : parseAssistantStream(attemptFinished.payload.stream);
  const origin =
    attemptFinished === undefined
      ? live === null
        ? null
        : "model"
      : parseStreamOrigin(attemptFinished.payload.stream_origin);
  const firstTokenTime =
    stream !== null && origin === "model"
      ? assistantStreamFirstTokenTime(stream)
      : null;
  const completedTime = timestamp(completed?.occurredAt);
  const usage = usageFrom(attemptFinished);
  const displayText =
    content.trim().length > 0
      ? content
      : finishReason === "tool_calls"
        ? ""
        : attemptFinished?.payload.error_code === "IMAGE_OFFLOAD_REQUIRED"
          ? zhCN.trajectory.imageOffloadRequired
          : zhCN.trajectory.emptyAssistant;
  return baseRecord(events, {
    turn: turnFor(first, context),
    text: displayText,
    searchText: [displayText, run?.model_snapshot.model_id ?? ""].join(" "),
    status,
    completedAt: completed?.occurredAt ?? null,
    startedAt: started?.occurredAt ?? null,
    isError:
      status === "failed" ||
      outcome === "error" ||
      outcome === "length" ||
      outcome === "content_filter",
    source: {
      role: "assistant",
      run_id: first.runId,
      message_id: messageId,
      step,
      attempt,
    },
    input: {
      model_id: run?.model_snapshot.model_id ?? null,
      reasoning_effort: run?.model_snapshot.reasoning_effort ?? null,
      step,
      attempt,
    },
    output: {
      content,
      finish_reason: typeof finishReason === "string" ? finishReason : null,
      outcome,
      error_code: stringValue(attemptFinished?.payload.error_code),
      stream,
      stream_origin: origin,
      blocks: attemptFinished?.payload.blocks ?? null,
      replay_state: attemptFinished?.payload.replay_state ?? null,
    },
    usage,
    callOnly: content.trim().length === 0 && finishReason === "tool_calls",
    assistantMetrics: {
      stepStartTime: startTime,
      firstTokenTime,
      completedTime,
      timingRecorded:
        startTime !== null &&
        firstTokenTime !== null &&
        completedTime !== null &&
        startTime <= firstTokenTime &&
        firstTokenTime <= completedTime,
    },
  });
}

function reconstructAssistantText(
  events: readonly TrajectoryEventProjection[],
): string {
  const result: string[] = [];
  for (const event of events) {
    if (event.eventType !== "message.assistant.delta") continue;
    const text = stringValue(event.payload.text);
    const offset = integerValue(event.payload.offset);
    if (text === null || offset === null || offset > result.length) continue;
    const delta = Array.from(text);
    const overlap = Math.min(result.length - offset, delta.length);
    if (
      result
        .slice(offset, offset + overlap)
        .some((item, index) => item !== delta[index])
    )
      continue;
    result.push(...delta.slice(overlap));
  }
  return result.join("");
}

function usageFrom(
  event: TrajectoryEventProjection | undefined,
): TrajectoryUsage | null {
  if (event === undefined) return null;
  const inputTokens = nullableInteger(event.payload.input_tokens);
  const outputTokens = nullableInteger(event.payload.output_tokens);
  const totalTokens = nullableInteger(event.payload.total_tokens);
  if (inputTokens === null && outputTokens === null && totalTokens === null)
    return null;
  return { inputTokens, outputTokens, totalTokens };
}
