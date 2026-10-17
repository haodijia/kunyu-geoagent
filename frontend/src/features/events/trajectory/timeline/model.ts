import type {
  TrajectoryTimelineMode,
  TrajectoryTimeRange,
} from "@/features/events/trajectory/timeline/timeline";
import { formatTimelineOffset } from "@/features/events/trajectory/timeline/timeline";
import type { TrajectoryTranslate } from "@/features/events/trajectory/trajectory-locales";
import type {
  AssistantMetricDetail,
  TrajectoryCellKind,
  TrajectoryCellProps,
  TrajectoryTurnModel,
} from "@/features/events/trajectory/trajectory-model";

interface TimelineRecordDetail {
  decodingMs?: number;
  durationMs?: number;
  startedAt?: number;
  ttftMs?: number;
}

interface FractionRange {
  start: number;
  end: number;
}

export interface HoverPoint {
  fraction: number;
  recordIndex: number | null;
}

export interface PanGesture {
  anchorClientX: number;
  anchorStart: number;
  moved: boolean;
  pannable: boolean;
  pointerId: number;
}

function assistantTimingDetail(
  metrics: AssistantMetricDetail | undefined,
): Pick<TimelineRecordDetail, "ttftMs" | "decodingMs"> {
  const start = metrics?.stepStartTime;
  const first = metrics?.firstTokenTime;
  const completed = metrics?.completedTime;
  if (
    metrics?.timingRecorded !== true ||
    typeof start !== "number" ||
    typeof first !== "number" ||
    typeof completed !== "number" ||
    !Number.isFinite(start) ||
    !Number.isFinite(first) ||
    !Number.isFinite(completed) ||
    first < start ||
    completed < first
  )
    return {};
  return { ttftMs: first - start, decodingMs: completed - first };
}

export function timelineRecordDetail(
  cell: TrajectoryCellProps,
): TimelineRecordDetail {
  const durationMs =
    cell.timeSeconds === null || !Number.isFinite(cell.timeSeconds)
      ? undefined
      : Math.max(0, cell.timeSeconds * 1_000);
  const startedAt =
    cell.startedAt === null || !Number.isFinite(cell.startedAt)
      ? undefined
      : cell.startedAt;
  return {
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...assistantTimingDetail(cell.assistantMetrics),
  };
}

function timelineKindLabel(
  kind: TrajectoryCellKind,
  t: TrajectoryTranslate,
): string {
  switch (kind) {
    case "system":
      return t("kind.system");
    case "user":
      return t("kind.user");
    case "context":
      return t("kind.context");
    case "compacted":
      return t("kind.compacted");
    case "message":
      return t("kind.assistant");
    case "tool":
      return t("kind.tool");
    case "subtool":
      return t("kind.subtool");
  }
}

function formatRecordedTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

export function timelineTooltipLabel(
  kind: TrajectoryCellKind,
  detail: TimelineRecordDetail | undefined,
  t: TrajectoryTranslate,
): string {
  const heading = timelineKindLabel(kind, t);
  if (detail === undefined) return heading;
  const duration =
    detail.durationMs === undefined
      ? null
      : t("timeline.total", {
          duration: formatTimelineOffset(detail.durationMs, t),
        });
  const range =
    detail.startedAt === undefined
      ? null
      : detail.durationMs === undefined
        ? t("timeline.started", { time: formatRecordedTime(detail.startedAt) })
        : `${formatRecordedTime(detail.startedAt)} → ${formatRecordedTime(
            detail.startedAt + detail.durationMs,
          )}`;
  const segments =
    detail.ttftMs === undefined || detail.decodingMs === undefined
      ? null
      : t("timeline.ttftDecoding", {
          ttft: formatTimelineOffset(detail.ttftMs, t),
          decoding: formatTimelineOffset(detail.decodingMs, t),
        });
  const timing = [duration, segments]
    .filter((value) => value !== null)
    .join(" · ");
  return [heading, range, timing]
    .filter((value) => value !== null && value !== "")
    .join("\n");
}

/** Props for the fixed full-domain overview above the trajectory ledger. */
export interface TrajectoryTimelineProps {
  t: TrajectoryTranslate;
  turns: readonly TrajectoryTurnModel[];
  mode: TrajectoryTimelineMode;
  range: TrajectoryTimeRange | null;
  /** Whether the loaded timeline omits an earlier history prefix. */
  hasEarlierRecords?: boolean;
  /** Load one earlier history page from the truncation control. */
  onLoadEarlier?: () => Promise<boolean>;
  selectedIndex?: number | null;
  /** Record indexes matching the active ledger search, or null without a query. */
  searchMatchIndexes?: ReadonlySet<number> | null;
  onRangeChange: (range: TrajectoryTimeRange | null) => void;
  /** Select a directly clicked timeline block. */
  onRecordSelect?: (index: number) => void;
  /** Bring the nearest record into view after clicking timeline whitespace. */
  onRecordFocus?: (index: number) => void;
}

export function orderedRange(left: number, right: number): FractionRange {
  return left <= right
    ? { start: left, end: right }
    : { start: right, end: left };
}

export function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function centeredRange(
  center: number,
  width: number,
  minimum: number,
  maximum: number,
): FractionRange {
  const clampedWidth = Math.min(maximum - minimum, Math.max(0, width));
  const start = Math.min(
    Math.max(center - clampedWidth / 2, minimum),
    maximum - clampedWidth,
  );
  return { start, end: start + clampedWidth };
}

export function rangeFraction(
  range: TrajectoryTimeRange,
  start: number,
  duration: number,
  minimum: number,
  maximum: number,
): FractionRange {
  const bounded = orderedRange(
    Math.min(maximum, Math.max(minimum, range.start)),
    Math.min(maximum, Math.max(minimum, range.end)),
  );
  return {
    start: (bounded.start - start) / duration,
    end: (bounded.end - start) / duration,
  };
}
