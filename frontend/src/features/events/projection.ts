import type { SessionEvent } from "@/features/events/api";
import { zhCN } from "@/locales/zh-CN";

export type TrajectoryEventKind =
  | "system"
  | "user"
  | "assistant"
  | "tool"
  | "confirmation"
  | "unsupported";

export interface TrajectoryEventProjection {
  readonly id: string;
  readonly kind: TrajectoryEventKind;
  readonly entityId: string;
  readonly messageId: string | null;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly runId: string | null;
  readonly sequence: number;
  readonly eventType: string;
}

const RUN_CONTROL_EVENTS = new Set([
  "run.created",
  "run.model_selected",
  "run.queued",
  "run.started",
  "run.resumed",
  "run.interrupted",
  "run.recovery_required",
  "run.budget_reserved",
  "run.budget_settled",
  "run.completed",
  "run.failed",
  "run.cancelled"
]);

export function projectSessionEvent(
  event: SessionEvent
): TrajectoryEventProjection | null {
  if (event.event_type === "session.created" || RUN_CONTROL_EVENTS.has(event.event_type)) {
    return null;
  }
  if (event.event_type === "message.user.appended") {
    return projection(event, "user", requiredString(event, "message_id"));
  }
  if (event.event_type === "request.header") {
    const step = requiredInteger(event, "step");
    const attempt = requiredInteger(event, "attempt");
    const runId = requiredRunId(event);
    return projection(event, "system", `${runId}:${step}:${attempt}`);
  }
  if (
    event.event_type === "message.assistant.started" ||
    event.event_type === "message.assistant.delta" ||
    event.event_type === "message.assistant.completed" ||
    event.event_type === "model.attempt.finished"
  ) {
    const step = requiredInteger(event, "step");
    const attempt = requiredInteger(event, "attempt");
    const runId = requiredRunId(event);
    return projection(event, "assistant", `${runId}:${step}:${attempt}`);
  }
  if (
    event.event_type === "tool.requested" ||
    event.event_type === "tool.started" ||
    event.event_type === "tool.completed" ||
    event.event_type === "tool.failed" ||
    event.event_type === "tool.cancelled"
  ) {
    return projection(event, "tool", requiredString(event, "tool_call_id"));
  }
  if (
    event.event_type === "confirmation.requested" ||
    event.event_type === "confirmation.resolved"
  ) {
    return projection(
      event,
      "confirmation",
      requiredString(event, "confirmation_id")
    );
  }
  return projection(event, "unsupported", event.id);
}

function projection(
  event: SessionEvent,
  kind: TrajectoryEventKind,
  entityId: string
): TrajectoryEventProjection {
  const messageId = event.payload.message_id;
  return {
    id: event.id,
    kind,
    entityId,
    messageId: typeof messageId === "string" ? messageId : null,
    occurredAt: event.occurred_at,
    payload: event.payload,
    runId: event.run_id,
    sequence: event.sequence,
    eventType: event.event_type
  };
}

function requiredString(event: SessionEvent, field: string): string {
  const value = event.payload[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(zhCN.trajectory.invalidProjection(event.event_type, field));
  }
  return value;
}

function requiredInteger(event: SessionEvent, field: string): number {
  const value = event.payload[field];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(zhCN.trajectory.invalidProjection(event.event_type, field));
  }
  return value as number;
}

function requiredRunId(event: SessionEvent): string {
  if (event.run_id === null || event.run_id.length === 0) {
    throw new Error(zhCN.trajectory.invalidProjection(event.event_type, "run_id"));
  }
  return event.run_id;
}
