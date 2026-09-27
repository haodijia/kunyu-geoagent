import type { UserMessage } from "@/features/messages/api";
import type { TrajectoryEventProjection } from "./projection";
import type { TrajectoryTranslate } from "./trajectory-locales";

export type TrajectoryCellKind = "system" | "user" | "context" | "compacted" | "message" | "tool" | "subtool";
export interface AssistantMetricDetail {
  stepStartTime?: number;
  firstTokenTime?: number;
  completedTime?: number;
  timingRecorded?: boolean;
}
export interface TrajectoryCellProps {
  index: number;
  kind: TrajectoryCellKind;
  text: string;
  startedAt: number | null;
  timeSeconds: number | null;
  isError?: boolean;
  requestOnly?: boolean;
  assistantMetrics?: AssistantMetricDetail;
}
export interface TrajectoryTurnModel {
  turn: number | null;
  groups: { cells: TrajectoryCellProps[] }[];
}
export interface TrajectoryRecord {
  id: string;
  index: number;
  turn: number | null;
  kind: "user" | "unsupported";
  text: string;
  occurredAt: string;
  source: { role: "user" } | null;
}

export function buildTrajectoryRecords(
  events: readonly TrajectoryEventProjection[],
  messages: readonly UserMessage[]
): TrajectoryRecord[] {
  const byId = new Map(messages.map(message => [message.id, message]));
  return events.flatMap((event): TrajectoryRecord[] => {
    if (event.kind === "unsupported") {
      return [{ id: event.id, index: event.sequence, turn: null, kind: event.kind, text: "", occurredAt: event.occurredAt, source: null }];
    }
    const message = event.messageId === null ? undefined : byId.get(event.messageId);
    // An event may arrive before the message query completes. Only render joined data.
    if (message === undefined) return [];
    return [{ id: event.id, index: event.sequence, turn: message.sequence, kind: event.kind, text: message.content, occurredAt: event.occurredAt, source: { role: message.role } }];
  });
}

export function trajectoryTurns(records: readonly TrajectoryRecord[]): TrajectoryTurnModel[] {
  return records.map(record => ({
    turn: record.turn,
    groups: [{ cells: [{
      index: record.index,
      kind: record.kind === "user" ? "user" : "system",
      text: record.text,
      startedAt: Date.parse(record.occurredAt),
      timeSeconds: record.kind === "user" ? 0 : null
    }] }]
  }));
}

export function formatDurationMillis(milliseconds: number, t: TrajectoryTranslate): string {
  return t("unit.milliseconds", { value: Math.round(milliseconds).toLocaleString("zh-CN") });
}
