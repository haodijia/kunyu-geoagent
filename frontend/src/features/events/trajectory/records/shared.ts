import type { TrajectoryEventProjection } from "@/features/events/projection/events";
import type { RecordContext } from "@/features/events/trajectory/records/context";
import type {
  AssistantMetricDetail,
  TrajectoryRecord,
  TrajectoryUsage,
} from "@/features/events/trajectory/trajectory-model";
import { sanitizeTrajectoryValue } from "@/features/events/trajectory/trajectory-sanitize";
import { zhCN } from "@/locales/zh-CN";

export function unsupportedRecord(
  event: TrajectoryEventProjection,
  context: RecordContext,
): TrajectoryRecord {
  const payload = sanitizeTrajectoryValue(event.payload);
  return baseRecord([event], {
    turn: turnFor(event, context),
    text: `${event.eventType} · ${zhCN.trajectory.unsupportedDescription}`,
    searchText: `${event.eventType} ${safeString(payload)}`,
    status: "unsupported",
    completedAt: null,
    startedAt: event.occurredAt,
    isError: false,
    source: {
      run_id: event.runId,
      event_id: event.id,
      event_type: event.eventType,
    },
    input: payload,
    output: null,
  });
}

export function baseRecord(
  events: readonly TrajectoryEventProjection[],
  value: {
    readonly turn: number | null;
    readonly text: string;
    readonly searchText: string;
    readonly status: string;
    readonly completedAt: string | null;
    readonly startedAt: string | null;
    readonly isError: boolean;
    readonly source: Readonly<Record<string, unknown>>;
    readonly input: unknown | null;
    readonly output: unknown | null;
    readonly usage?: TrajectoryUsage | null;
    readonly assistantMetrics?: AssistantMetricDetail;
    readonly callOnly?: boolean;
  },
): TrajectoryRecord {
  const first = events[0]!;
  const last = events.at(-1)!;
  const durationMillis = duration(value.startedAt, value.completedAt);
  return {
    id: `${first.kind}:${first.entityId}`,
    index: first.sequence,
    lastIndex: last.sequence,
    turn: value.turn,
    kind: first.kind,
    text: value.text,
    searchText: value.searchText,
    occurredAt: value.startedAt ?? first.occurredAt,
    completedAt: value.completedAt,
    durationMillis,
    status: value.status,
    isError: value.isError,
    source: sanitizeTrajectoryValue(value.source) as Readonly<
      Record<string, unknown>
    >,
    input: value.input,
    output: value.output,
    raw: {
      events: events.map((event) => ({
        sequence: event.sequence,
        event_type: event.eventType,
        occurred_at: event.occurredAt,
        payload: sanitizeTrajectoryValue(event.payload),
      })),
    },
    ...(integerValue(first.payload.step) === null
      ? {}
      : { step: integerValue(first.payload.step)! }),
    usage: value.usage ?? null,
    callOnly: value.callOnly,
    ...(value.assistantMetrics === undefined
      ? {}
      : { assistantMetrics: value.assistantMetrics }),
  };
}

export function turnFor(
  event: TrajectoryEventProjection,
  context: RecordContext,
): number | null {
  return event.runId === null
    ? null
    : (context.runTurns.get(event.runId) ?? null);
}

function duration(start: string | null, end: string | null): number | null {
  const startTime = timestamp(start);
  const endTime = timestamp(end);
  if (startTime === null || endTime === null || endTime < startTime)
    return null;
  return endTime - startTime;
}

export function timestamp(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function integerValue(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

export function nullableInteger(value: unknown): number | null {
  return value === null ? null : integerValue(value);
}

export function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function statusLabel(status: string): string {
  const labels = zhCN.trajectory.statuses as Readonly<Record<string, string>>;
  return labels[status] ?? status;
}

export function tokenCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid compaction token count.");
  return value;
}
