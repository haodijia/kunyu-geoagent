import type { SessionEvent } from "@/features/events/api";
import type { SessionMessage } from "./api";

export function applyMessageEvent(
  messages: SessionMessage[],
  event: SessionEvent
): { readonly messages: SessionMessage[]; readonly needsSnapshot: boolean } {
  if (event.event_type === "message.assistant.started") {
    const messageId = stringPayload(event, "message_id");
    if (messageId === null || event.run_id === null) {
      return { messages, needsSnapshot: true };
    }
    if (messages.some((item) => item.id === messageId)) {
      return { messages, needsSnapshot: false };
    }
    const step = numberPayload(event, "step");
    const attempt = numberPayload(event, "attempt");
    if (step === null || attempt === null) {
      return { messages, needsSnapshot: true };
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
          content: "",
          run_id: event.run_id,
          step,
          attempt,
          status: "streaming",
          content_length: 0,
          updated_sequence: event.sequence,
          created_at: event.occurred_at,
          updated_at: event.occurred_at
        }
      ]
    };
  }

  if (event.event_type === "message.assistant.delta") {
    const messageId = stringPayload(event, "message_id");
    const text = stringPayload(event, "text");
    const offset = numberPayload(event, "offset");
    if (messageId === null || text === null || offset === null) {
      return { messages, needsSnapshot: true };
    }
    const index = messages.findIndex((item) => item.id === messageId);
    if (index < 0) return { messages, needsSnapshot: true };
    const current = messages[index];
    if (current === undefined) return { messages, needsSnapshot: true };
    if (current.updated_sequence >= event.sequence) {
      return { messages, needsSnapshot: false };
    }
    const currentCodepoints = Array.from(current.content);
    const deltaCodepoints = Array.from(text);
    if (offset > currentCodepoints.length) {
      return { messages, needsSnapshot: true };
    }
    const overlap = currentCodepoints.slice(
      offset,
      Math.min(currentCodepoints.length, offset + deltaCodepoints.length)
    );
    if (overlap.some((value, position) => value !== deltaCodepoints[position])) {
      return { messages, needsSnapshot: true };
    }
    const tail = deltaCodepoints.slice(overlap.length).join("");
    const next = [...messages];
    next[index] = {
      ...current,
      content: current.content + tail,
      content_length: currentCodepoints.length + Array.from(tail).length,
      updated_sequence: event.sequence,
      updated_at: event.occurred_at
    };
    return { messages: next, needsSnapshot: false };
  }

  if (event.event_type === "message.assistant.completed") {
    const messageId = stringPayload(event, "message_id");
    if (messageId === null) return { messages, needsSnapshot: true };
    const index = messages.findIndex((item) => item.id === messageId);
    if (index < 0) return { messages, needsSnapshot: true };
    const current = messages[index];
    if (current === undefined) return { messages, needsSnapshot: true };
    if (current.updated_sequence >= event.sequence) {
      return { messages, needsSnapshot: false };
    }
    const next = [...messages];
    next[index] = {
      ...current,
      status: "completed",
      updated_sequence: event.sequence,
      updated_at: event.occurred_at
    };
    return { messages: next, needsSnapshot: false };
  }

  return { messages, needsSnapshot: false };
}

function stringPayload(event: SessionEvent, key: string): string | null {
  const value = event.payload[key];
  return typeof value === "string" ? value : null;
}

function numberPayload(event: SessionEvent, key: string): number | null {
  const value = event.payload[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}
