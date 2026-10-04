import {
  contentText,
  parseContentBlocks,
} from "@/features/events/content-blocks";
import type { SessionEvent } from "@/features/events/api";
import {
  assistantStreamText,
  parseAssistantStream,
} from "@/features/events/assistant-stream";
import { parseAttachments } from "@/features/attachments/api";
import type { SessionMessage } from "./api";

export interface MessageEventResult {
  readonly messages: SessionMessage[];
  readonly needsSnapshot: boolean;
}

export function isMessageEvent(event: SessionEvent): boolean {
  return (
    event.event_type === "message.user.appended" ||
    event.event_type === "message.assistant.started" ||
    event.event_type === "message.assistant.delta" ||
    event.event_type === "message.assistant.completed" ||
    event.event_type === "model.attempt.finished"
  );
}

export function applyMessageEvent(
  messages: SessionMessage[],
  event: SessionEvent,
): MessageEventResult {
  if (event.event_type === "message.user.appended") {
    return applyUserAppended(messages, event);
  }
  if (event.event_type === "message.assistant.started") {
    return applyAssistantStarted(messages, event);
  }
  if (event.event_type === "message.assistant.delta") {
    return applyAssistantDelta(messages, event);
  }
  if (event.event_type === "message.assistant.completed") {
    return applyAssistantCompleted(messages, event);
  }
  if (event.event_type === "model.attempt.finished")
    return applyAttemptFinished(messages, event);
  return { messages: [...messages], needsSnapshot: false };
}

function applyUserAppended(
  messages: SessionMessage[],
  event: SessionEvent,
): MessageEventResult {
  const messageId = stringPayload(event, "message_id");
  const content = stringPayload(event, "content");
  const role = stringPayload(event, "role");
  if (messageId === null || content === null || role !== "user") {
    return snapshotNeeded(messages);
  }
  if (event.payload.attachments === undefined) return snapshotNeeded(messages);
  const attachments = parseAttachments(event.payload.attachments);
  const existing = messages.find((item) => item.id === messageId);
  if (existing !== undefined) {
    return existing.role === "user" &&
      existing.content === content &&
      JSON.stringify(existing.attachments) === JSON.stringify(attachments) &&
      existing.run_id === event.run_id
      ? unchanged(messages)
      : snapshotNeeded(messages);
  }
  const sequence = Math.max(0, ...messages.map((item) => item.sequence)) + 1;
  return {
    needsSnapshot: false,
    messages: [
      ...messages,
      {
        id: messageId,
        session_id: event.session_id,
        sequence,
        role: "user",
        attachments,
        content,
        run_id: event.run_id,
        step: null,
        attempt: null,
        status: "completed",
        content_length: Array.from(content).length,
        updated_sequence: event.sequence,
        created_at: event.occurred_at,
        updated_at: event.occurred_at,
      },
    ],
  };
}

export function mergeMessageSnapshots(
  current: readonly SessionMessage[] | undefined,
  incoming: readonly SessionMessage[],
): SessionMessage[] {
  if (current === undefined) return [...incoming];
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = merged.get(message.id);
    if (
      existing === undefined ||
      message.updated_sequence >= existing.updated_sequence
    ) {
      merged.set(message.id, message);
    }
  }
  return [...merged.values()].sort(
    (left, right) => left.sequence - right.sequence,
  );
}

function applyAssistantStarted(
  messages: SessionMessage[],
  event: SessionEvent,
): MessageEventResult {
  const messageId = stringPayload(event, "message_id");
  const step = numberPayload(event, "step");
  const attempt = numberPayload(event, "attempt");
  if (
    messageId === null ||
    step === null ||
    attempt === null ||
    event.run_id === null
  ) {
    return snapshotNeeded(messages);
  }
  const existing = messages.find((item) => item.id === messageId);
  if (existing !== undefined) {
    return existing.run_id === event.run_id &&
      existing.step === step &&
      existing.attempt === attempt
      ? unchanged(messages)
      : snapshotNeeded(messages);
  }
  const sequence = Math.max(0, ...messages.map((item) => item.sequence)) + 1;
  return {
    needsSnapshot: false,
    messages: [
      ...messages,
      {
        id: messageId,
        session_id: event.session_id,
        sequence,
        role: "assistant",
        attachments: [],
        content: "",
        run_id: event.run_id,
        step,
        attempt,
        status: "streaming",
        content_length: 0,
        updated_sequence: event.sequence,
        created_at: event.occurred_at,
        updated_at: event.occurred_at,
      },
    ],
  };
}

function applyAssistantDelta(
  messages: SessionMessage[],
  event: SessionEvent,
): MessageEventResult {
  const messageId = stringPayload(event, "message_id");
  const text = stringPayload(event, "text");
  const step = numberPayload(event, "step");
  const attempt = numberPayload(event, "attempt");
  const offset = numberPayload(event, "offset");
  if (
    messageId === null ||
    text === null ||
    text.length === 0 ||
    step === null ||
    attempt === null ||
    offset === null
  ) {
    return snapshotNeeded(messages);
  }
  const index = messages.findIndex((item) => item.id === messageId);
  const current = messages[index];
  if (index < 0 || current === undefined) return snapshotNeeded(messages);
  if (current.step !== step || current.attempt !== attempt) {
    return snapshotNeeded(messages);
  }
  if (current.updated_sequence >= event.sequence) return unchanged(messages);

  const currentCodepoints = Array.from(current.content);
  const deltaCodepoints = Array.from(text);
  if (offset > currentCodepoints.length) return snapshotNeeded(messages);
  const overlap = currentCodepoints.slice(
    offset,
    Math.min(currentCodepoints.length, offset + deltaCodepoints.length),
  );
  if (overlap.some((value, position) => value !== deltaCodepoints[position])) {
    return snapshotNeeded(messages);
  }
  const tail = deltaCodepoints.slice(overlap.length);
  const next = [...messages];
  next[index] = {
    ...current,
    content: current.content + tail.join(""),
    content_length: currentCodepoints.length + tail.length,
    updated_sequence: event.sequence,
    updated_at: event.occurred_at,
  };
  return { messages: next, needsSnapshot: false };
}

function applyAssistantCompleted(
  messages: SessionMessage[],
  event: SessionEvent,
): MessageEventResult {
  const messageId = stringPayload(event, "message_id");
  const step = numberPayload(event, "step");
  const attempt = numberPayload(event, "attempt");
  const contentLength = numberPayload(event, "content_length");
  if (
    messageId === null ||
    step === null ||
    attempt === null ||
    contentLength === null
  ) {
    return snapshotNeeded(messages);
  }
  const index = messages.findIndex((item) => item.id === messageId);
  const current = messages[index];
  if (index < 0 || current === undefined) return snapshotNeeded(messages);
  if (current.step !== step || current.attempt !== attempt) {
    return snapshotNeeded(messages);
  }
  if (current.updated_sequence >= event.sequence) return unchanged(messages);
  if (Array.from(current.content).length !== contentLength) {
    return snapshotNeeded(messages);
  }
  const next = [...messages];
  next[index] = {
    ...current,
    status: "completed",
    content_length: contentLength,
    updated_sequence: event.sequence,
    updated_at: event.occurred_at,
  };
  return { messages: next, needsSnapshot: false };
}

function unchanged(messages: SessionMessage[]): MessageEventResult {
  return { messages, needsSnapshot: false };
}

function applyAttemptFinished(
  messages: SessionMessage[],
  event: SessionEvent,
): MessageEventResult {
  const identity = stringPayload(event, "message_id");
  const position = messages.findIndex((message) => message.id === identity);
  const current = messages[position];
  if (
    current === undefined ||
    current.step !== event.payload.step ||
    current.attempt !== event.payload.attempt
  )
    return snapshotNeeded(messages);
  if (current.updated_sequence >= event.sequence) return unchanged(messages);
  const text = assistantStreamText(parseAssistantStream(event.payload.stream));
  if (
    event.payload.error_code === "OUTPUT_LIMIT"
      ? !text.startsWith(current.content)
      : text !== current.content
  )
    return snapshotNeeded(messages);
  const outcome = event.payload.outcome;
  const status =
    outcome === "stop" || outcome === "tool_calls"
      ? "completed"
      : outcome === "cancelled"
        ? "interrupted"
        : "failed";
  const next = [...messages];
  next[position] = {
    ...current,
    status,
    content: contentText(parseContentBlocks(event.payload.blocks)),
    content_length: Array.from(
      contentText(parseContentBlocks(event.payload.blocks)),
    ).length,
    updated_sequence: event.sequence,
    updated_at: event.occurred_at,
  };
  return { messages: next, needsSnapshot: false };
}

function snapshotNeeded(messages: SessionMessage[]): MessageEventResult {
  return { messages, needsSnapshot: true };
}

function stringPayload(event: SessionEvent, key: string): string | null {
  const value = event.payload[key];
  return typeof value === "string" ? value : null;
}

function numberPayload(event: SessionEvent, key: string): number | null {
  const value = event.payload[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
