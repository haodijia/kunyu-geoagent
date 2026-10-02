import { streamEvents } from "@/api/client";
import {
  parseAssistantBaseline,
  parseAssistantFrame,
  type AssistantBaseline,
  type AssistantFrame,
} from "./live-assistant";
import { zhCN } from "@/locales/zh-CN";

export interface SessionEvent {
  readonly id: string;
  readonly session_id: string;
  readonly sequence: number;
  readonly event_type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurred_at: string;
  readonly run_id: string | null;
}

export type SessionFollow =
  | {
      readonly type: "opened";
      readonly cursor: number;
      readonly events: readonly SessionEvent[];
      readonly assistant: AssistantBaseline;
    }
  | { readonly type: "event"; readonly event: SessionEvent }
  | { readonly type: "assistant"; readonly frame: AssistantFrame };

export async function* streamSessionFollow(
  sessionId: string,
  afterSequence: number,
  signal: AbortSignal,
  onOpen: () => void,
): AsyncGenerator<SessionFollow> {
  const path =
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/events/stream` +
    `?after_sequence=${afterSequence}`;

  let opened = false;
  for await (const frame of streamEvents(path, signal)) {
    if (frame.event === "session.opened") {
      const value = JSON.parse(frame.data) as unknown;
      if (
        opened ||
        frame.id !== null ||
        !isRecord(value) ||
        !Number.isSafeInteger(value.cursor) ||
        (value.cursor as number) < afterSequence ||
        !Array.isArray(value.events)
      )
        throw new Error("Invalid session opening snapshot.");
      const events = value.events.map(parseSessionEvent);
      let cursor = afterSequence;
      for (const event of events) {
        if (event.session_id !== sessionId || event.sequence !== cursor + 1)
          throw new Error("Session opening event gap.");
        cursor = event.sequence;
      }
      if (cursor !== value.cursor)
        throw new Error("Session opening cursor differs from its events.");
      const baseline = parseAssistantBaseline(value.assistant_stream);
      opened = true;
      onOpen();
      yield {
        type: "opened",
        cursor,
        events,
        assistant: baseline,
      };
      continue;
    }
    if (!opened)
      throw new Error("Session follow omitted its opening snapshot.");
    if (frame.event === "assistant.stream") {
      if (frame.id !== null)
        throw new Error(
          "Transient assistant frames cannot advance the durable cursor.",
        );
      yield {
        type: "assistant",
        frame: parseAssistantFrame(JSON.parse(frame.data)),
      };
      continue;
    }
    const event = parseSessionEvent(JSON.parse(frame.data));
    if (event.session_id !== sessionId) {
      throw new Error(zhCN.trajectory.eventFromOtherSession);
    }
    if (frame.id !== String(event.sequence)) {
      throw new Error(zhCN.trajectory.eventIdMismatch);
    }
    if (frame.event !== event.event_type) {
      throw new Error(zhCN.trajectory.eventTypeMismatch);
    }
    yield { type: "event", event };
  }
}

function parseSessionEvent(value: unknown): SessionEvent {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.session_id !== "string" ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 1 ||
    typeof value.event_type !== "string" ||
    !isRecord(value.payload) ||
    typeof value.occurred_at !== "string" ||
    !Number.isFinite(Date.parse(value.occurred_at)) ||
    !(value.run_id === null || typeof value.run_id === "string")
  ) {
    throw new Error(zhCN.trajectory.invalidEvent);
  }

  return value as unknown as SessionEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
