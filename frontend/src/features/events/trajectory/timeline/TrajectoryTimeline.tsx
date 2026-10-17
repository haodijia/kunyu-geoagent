import { Tooltip } from "@/components/ui/tooltip";
import type { TrajectoryTimelineProps } from "@/features/events/trajectory/timeline/model";
import { timelineTooltipLabel } from "@/features/events/trajectory/timeline/model";
import {
  EarlierHistoryBoundary,
  LaneLabels,
  TIMELINE_TOOLTIP_DELAY_MS,
} from "@/features/events/trajectory/timeline/TimelineLabels";
import css from "@/features/events/trajectory/timeline/TrajectoryTimeline.module.css";
import type { CSSProperties } from "react";
import { memo } from "react";

import { useTrajectoryTimeline } from "./useTrajectoryTimeline";

/** Render the timeline; gesture and viewport state belong to the timeline hook. */
export const TrajectoryTimeline = memo(function TrajectoryTimeline(
  props: TrajectoryTimelineProps,
) {
  const {
    t,
    mode,
    hasEarlierRecords = false,
    selectedIndex = null,
    searchMatchIndexes = null,
    onRangeChange,
  } = props;
  const state = useTrajectoryTimeline(props);
  const { rootRef, loadingEarlier, setHover, loadEarlier } = state;
  if (state.model === null) {
    return (
      <section
        ref={rootRef}
        className={css.root}
        aria-label={t("timeline.aria")}
      >
        <div className={css.plot}>
          <LaneLabels t={t} />
          <div className={css.track}>
            <span className={css.empty}>{t("timeline.noTimingData")}</span>
            {hasEarlierRecords && (
              <EarlierHistoryBoundary
                loading={loadingEarlier}
                onHover={() => {
                  setHover(null);
                }}
                onLoad={loadEarlier}
                t={t}
              />
            )}
          </div>
        </div>
      </section>
    );
  }

  const {
    model,
    detailByIndex,
    dragRef,
    panRef,
    trackRef,
    draft,
    hover,
    panning,
    animateViewport,
    fullDuration,
    domainDuration,
    domainStart,
    showsEarlierBoundary,
    projectedDomainStyle,
    visibleRange,
    activeRange,
    onKeyDown,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    onPointerCancel,
  } = state;

  return (
    <section ref={rootRef} className={css.root} aria-label={t("timeline.aria")}>
      <div className={css.plot}>
        <LaneLabels t={t} />
        <div
          ref={trackRef}
          className={css.track}
          data-panning={panning || undefined}
          aria-label={t("timeline.overviewAria")}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerCancel}
          onPointerLeave={() => {
            if (dragRef.current === null && panRef.current === null)
              setHover(null);
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            onRangeChange(null);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
          }}
        >
          {showsEarlierBoundary && (
            <EarlierHistoryBoundary
              loading={loadingEarlier}
              onHover={() => {
                setHover(null);
              }}
              onLoad={loadEarlier}
              t={t}
            />
          )}
          {hover !== null && hover.recordIndex === null && draft === null && (
            <div
              className={css.hoverLine}
              data-timeline-hover-line
              aria-hidden="true"
              style={
                {
                  "--trajectory-hover-left": `${hover.fraction * 100}%`,
                } as CSSProperties
              }
            />
          )}
          {visibleRange !== null && (
            <>
              <div
                className={css.selection}
                data-dragging={draft === null ? undefined : "true"}
                aria-hidden="true"
                style={
                  {
                    "--trajectory-selection-left": `${visibleRange.start * 100}%`,
                    "--trajectory-selection-width": `${(visibleRange.end - visibleRange.start) * 100}%`,
                  } as CSSProperties
                }
              />
              <div
                className={css.selectionEdges}
                data-dragging={draft === null ? undefined : "true"}
                aria-hidden="true"
                style={
                  {
                    "--trajectory-selection-left": `${visibleRange.start * 100}%`,
                    "--trajectory-selection-width": `${(visibleRange.end - visibleRange.start) * 100}%`,
                  } as CSSProperties
                }
              />
            </>
          )}
          <div
            className={css.turnBoundaries}
            data-animate-viewport={animateViewport || undefined}
            aria-hidden="true"
            style={projectedDomainStyle}
          >
            {model.turnBoundaries
              .filter(
                (boundary) =>
                  boundary.time > model.start &&
                  boundary.time >= domainStart &&
                  boundary.time <= domainStart + domainDuration,
              )
              .map((boundary) => (
                <span
                  className={css.turnBoundary}
                  data-turn={boundary.turn}
                  key={boundary.turn}
                  style={
                    {
                      "--trajectory-turn-left": `${((boundary.time - model.start) / fullDuration) * 100}%`,
                    } as CSSProperties
                  }
                />
              ))}
          </div>
          <div
            className={css.lanes}
            data-animate-viewport={animateViewport || undefined}
            data-timeline-domain
            style={projectedDomainStyle}
          >
            {model.spans
              .filter(
                (span) =>
                  span.index === selectedIndex ||
                  (span.end >= domainStart &&
                    span.start <= domainStart + domainDuration),
              )
              .map((span) => {
                const left = (span.start - model.start) / fullDuration;
                const width = (span.end - span.start) / fullDuration;
                const widthPercent = width * 100;
                const detail = detailByIndex.get(span.index);
                const ttftMs = detail?.ttftMs;
                const decodingMs = detail?.decodingMs;
                const ttftFraction =
                  ttftMs === undefined ||
                  decodingMs === undefined ||
                  ttftMs + decodingMs <= 0
                    ? null
                    : ttftMs / (ttftMs + decodingMs);
                return (
                  <Tooltip
                    key={span.index}
                    label={timelineTooltipLabel(span.kind, detail, t)}
                    side="bottom"
                    delayMs={TIMELINE_TOOLTIP_DELAY_MS}
                  >
                    <span
                      aria-hidden="true"
                      className={css.span}
                      data-timeline-span={span.kind}
                      data-timeline-record-index={span.index}
                      data-assistant-timing={
                        ttftFraction === null ? undefined : "true"
                      }
                      data-error={span.isError || undefined}
                      data-equal-duration={mode === "time" || undefined}
                      data-current={span.index === selectedIndex || undefined}
                      data-hovered={
                        hover?.recordIndex === span.index || undefined
                      }
                      data-search-match={
                        searchMatchIndexes === null
                          ? undefined
                          : searchMatchIndexes.has(span.index)
                            ? "true"
                            : "false"
                      }
                      data-selected={
                        activeRange === null
                          ? undefined
                          : span.start <= activeRange.end &&
                              span.end >= activeRange.start
                            ? "true"
                            : "false"
                      }
                      style={
                        {
                          "--trajectory-span-left": `${left * 100}%`,
                          "--trajectory-span-width": `${widthPercent}%`,
                          "--trajectory-span-gap": `min(${widthPercent * 0.08}%, 1px)`,
                          "--trajectory-span-lane": span.lane,
                          ...(ttftFraction === null
                            ? {}
                            : {
                                "--trajectory-assistant-ttft": `${ttftFraction * 100}%`,
                              }),
                        } as CSSProperties
                      }
                    />
                  </Tooltip>
                );
              })}
          </div>
        </div>
      </div>
    </section>
  );
});
