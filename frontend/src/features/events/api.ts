import { streamEvents } from "@/api/client";
import { zhCN } from "@/locales/zh-CN";

export interface SessionEvent {
  readonly id: string;
  readonly session_id: string;
  readonly sequence: number;
  readonly event_type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurred_at: string;
}

export async function* streamSessionEvents(
  sessionId: string,
  afterSequence: number,
  signal: AbortSignal,
  onOpen: () => void
): AsyncGenerator<SessionEvent> {
  const path =
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/events` +
    `?after_sequence=${afterSequence}`;

  for await (const frame of streamEvents(path, signal, onOpen)) {
    const event = parseSessionEvent(frame.data);
    if (event.session_id !== sessionId) {
      throw new Error(zhCN.trajectory.eventFromOtherSession);
    }
    if (frame.id !== String(event.sequence)) {
      throw new Error(zhCN.trajectory.eventIdMismatch);
    }
    if (frame.event !== event.event_type) {
      throw new Error(zhCN.trajectory.eventTypeMismatch);
    }
    yield event;
  }
}

function parseSessionEvent(data: string): SessionEvent {
  const value = JSON.parse(data) as unknown;
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.session_id !== "string" ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 1 ||
    typeof value.event_type !== "string" ||
    !isRecord(value.payload) ||
    typeof value.occurred_at !== "string" ||
    !Number.isFinite(Date.parse(value.occurred_at))
  ) {
    throw new Error(zhCN.trajectory.invalidEvent);
  }

  return value as unknown as SessionEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
