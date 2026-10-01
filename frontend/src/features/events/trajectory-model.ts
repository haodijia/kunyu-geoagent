import type { TrajectoryEventKind } from "./projection";
import type { TrajectoryTranslate } from "./trajectory-locales";

export type TrajectoryCellKind =
  "system" | "user" | "context" | "compacted" | "message" | "tool" | "subtool";

export interface AssistantMetricDetail {
  stepStartTime: number | null;
  firstTokenTime: number | null;
  completedTime: number | null;
  timingRecorded: boolean;
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

export interface TrajectoryUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
}

export interface TrajectoryRecord {
  readonly id: string;
  readonly index: number;
  readonly lastIndex: number;
  readonly turn: number | null;
  readonly kind: TrajectoryEventKind;
  readonly text: string;
  readonly searchText: string;
  readonly occurredAt: string;
  readonly completedAt: string | null;
  readonly durationMillis: number | null;
  readonly status: string;
  readonly isError: boolean;
  readonly source: Readonly<Record<string, unknown>>;
  readonly input: unknown | null;
  readonly output: unknown | null;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly usage: TrajectoryUsage | null;
  readonly assistantMetrics?: AssistantMetricDetail;
  readonly requestOnly?: boolean;
  readonly callOnly?: boolean;
  readonly step?: number;
  readonly schema?: unknown;
  readonly prompt?: TrajectoryPrompt;
  readonly previousPrompt?: TrajectoryPrompt;
}

export interface TrajectoryPrompt {
  readonly system: string;
  readonly tools: readonly unknown[];
  readonly model: Readonly<Record<string, unknown>>;
}

export function trajectoryTurns(
  records: readonly TrajectoryRecord[],
): TrajectoryTurnModel[] {
  const grouped = new Map<number | null, TrajectoryCellProps[]>();
  for (const record of records) {
    const cells = grouped.get(record.turn) ?? [];
    cells.push({
      index: record.index,
      kind: cellKind(record.kind),
      text: record.text,
      startedAt: timestamp(record.occurredAt),
      timeSeconds:
        record.durationMillis === null ? null : record.durationMillis / 1_000,
      isError: record.isError,
      requestOnly: record.requestOnly,
      ...(record.assistantMetrics === undefined
        ? {}
        : { assistantMetrics: record.assistantMetrics }),
    });
    grouped.set(record.turn, cells);
  }
  return [...grouped.entries()].map(([recordTurn, cells]) => ({
    turn: recordTurn,
    groups: [{ cells }],
  }));
}

export function formatDurationMillis(
  milliseconds: number | null,
  t: TrajectoryTranslate,
): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "—";
  return t("unit.milliseconds", {
    value: Math.round(milliseconds).toLocaleString("zh-CN"),
  });
}

function cellKind(kind: TrajectoryEventKind): TrajectoryCellKind {
  switch (kind) {
    case "system":
      return "system";
    case "context":
      return "context";
    case "user":
      return "user";
    case "assistant":
      return "message";
    case "tool":
      return "tool";
    case "confirmation":
      return "tool";
    case "unsupported":
      return "system";
  }
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
