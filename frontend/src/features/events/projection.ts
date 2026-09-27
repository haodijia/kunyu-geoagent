import type { SessionEvent } from "@/features/events/api";
import { zhCN } from "@/locales/zh-CN";

export type TrajectoryEventKind = "user" | "unsupported";

export interface TrajectoryEventProjection {
  readonly id: string;
  readonly kind: TrajectoryEventKind;
  readonly messageId: string | null;
  readonly occurredAt: string;
  readonly sequence: number;
}

export function projectSessionEvent(
  event: SessionEvent
): TrajectoryEventProjection | null {
  switch (event.event_type) {
    case "session.created":
      return null;
    case "message.user.appended": {
      const messageId = event.payload.message_id;
      if (typeof messageId !== "string") {
        throw new Error(zhCN.trajectory.missingMessageId);
      }
      return {
        id: event.id,
        kind: "user",
        messageId,
        occurredAt: event.occurred_at,
        sequence: event.sequence
      };
    }
    default:
      return {
        id: event.id,
        kind: "unsupported",
        messageId: null,
        occurredAt: event.occurred_at,
        sequence: event.sequence
      };
  }
}
