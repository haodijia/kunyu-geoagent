import { Tooltip } from "@/components/ui/tooltip";
import css from "@/features/events/trajectory/timeline/TrajectoryTimeline.module.css";
import type { TrajectoryTranslate } from "@/features/events/trajectory/trajectory-locales";

export const TIMELINE_TOOLTIP_DELAY_MS = 500;

export function LaneLabels({ t }: { t: TrajectoryTranslate }) {
  return (
    <div className={css.labels} aria-hidden="true">
      <span>{t("column.input")}</span>
      <span>{t("column.model")}</span>
      <span>{t("column.tools")}</span>
    </div>
  );
}

export function EarlierHistoryBoundary({
  loading,
  onHover,
  onLoad,
  t,
}: {
  loading: boolean;
  onHover: () => void;
  onLoad: (() => void) | undefined;
  t: TrajectoryTranslate;
}) {
  return (
    <Tooltip
      label={
        loading ? t("history.loadingEarlier") : t("history.clickToLoadEarlier")
      }
      side="right"
      delayMs={TIMELINE_TOOLTIP_DELAY_MS}
    >
      <button
        type="button"
        className={css.earlierHistory}
        data-earlier-history
        data-loading={loading || undefined}
        aria-label={
          loading ? t("history.loadingEarlierAria") : t("history.loadEarlier")
        }
        aria-disabled={loading || onLoad === undefined}
        onClick={onLoad}
        onPointerEnter={(event) => {
          event.stopPropagation();
          onHover();
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        …
      </button>
    </Tooltip>
  );
}
