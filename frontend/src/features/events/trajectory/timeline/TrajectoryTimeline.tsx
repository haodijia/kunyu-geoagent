import { Tooltip } from "@/components/ui/tooltip";
import type { TrajectoryTimelineProps } from "@/features/events/trajectory/timeline/model";
import { timelineTooltipLabel } from "@/features/events/trajectory/timeline/model";
import {
  EarlierHistoryBoundary,
  LaneLabels,
  TIMELINE_TOOLTIP_DELAY_MS,
} from "@/features/events/trajectory/timeline/TimelineLabels";
import css from "@/features/events/trajectory/timeline/TrajectoryTimeline.module.css";
import { computed, defineComponent, toRefs, type CSSProperties } from "vue";
import { useTrajectoryTimeline } from "./useTrajectoryTimeline";

/** Render the timeline; gesture and viewport state belong to the timeline hook. */
export const TrajectoryTimeline = defineComponent(
  (props: TrajectoryTimelineProps, { slots: _slots }) => {
    const { t, mode, onRangeChange } = toRefs(props);
    const hasEarlierRecords = computed(() => props.hasEarlierRecords ?? false);
    const selectedIndex = computed(() => props.selectedIndex ?? null);
    const searchMatchIndexes = computed(() => props.searchMatchIndexes ?? null);
    const state = useTrajectoryTimeline(() => props);
    const { rootRef, loadingEarlier, setHover, loadEarlier } = toRefs(state);
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
    } = toRefs(state);
    return () => {
      const _hasEarlierRecords = hasEarlierRecords.value,
        _selectedIndex = selectedIndex.value,
        _searchMatchIndexes = searchMatchIndexes.value;
      const timelineModel = model.value;
      if (timelineModel === null) {
        return (
          <section
            ref={rootRef}
            class={css.root}
            aria-label={t.value("timeline.aria")}
          >
            <div class={css.plot}>
              <LaneLabels t={t.value} />
              <div class={css.track}>
                <span class={css.empty}>
                  {t.value("timeline.noTimingData")}
                </span>
                {_hasEarlierRecords && (
                  <EarlierHistoryBoundary
                    loading={loadingEarlier.value}
                    onHover={() => {
                      setHover.value(null);
                    }}
                    onLoad={loadEarlier.value}
                    t={t.value}
                  />
                )}
              </div>
            </div>
          </section>
        );
      }
      return (
        <section
          ref={rootRef}
          class={css.root}
          aria-label={t.value("timeline.aria")}
        >
          <div class={css.plot}>
            <LaneLabels t={t.value} />
            <div
              ref={trackRef}
              class={css.track}
              data-panning={panning.value || undefined}
              aria-label={t.value("timeline.overviewAria")}
              tabindex={0}
              onKeydown={onKeyDown.value}
              onPointerdown={onPointerDown.value}
              onPointermove={onPointerMove.value}
              onPointerup={onPointerEnd.value}
              onPointercancel={onPointerCancel.value}
              onPointerleave={() => {
                if (dragRef.value === null && panRef.value === null)
                  setHover.value(null);
              }}
              onDblclick={(event) => {
                event.preventDefault();
                onRangeChange.value(null);
              }}
              onContextmenu={(event) => {
                event.preventDefault();
              }}
            >
              {showsEarlierBoundary.value && (
                <EarlierHistoryBoundary
                  loading={loadingEarlier.value}
                  onHover={() => {
                    setHover.value(null);
                  }}
                  onLoad={loadEarlier.value}
                  t={t.value}
                />
              )}
              {hover.value !== null &&
                hover.value.recordIndex === null &&
                draft.value === null && (
                  <div
                    class={css.hoverLine}
                    data-timeline-hover-line
                    aria-hidden="true"
                    style={
                      {
                        "--trajectory-hover-left": `${hover.value.fraction * 100}%`,
                      } as CSSProperties
                    }
                  />
                )}
              {visibleRange.value !== null && (
                <>
                  <div
                    class={css.selection}
                    data-dragging={draft.value === null ? undefined : "true"}
                    aria-hidden="true"
                    style={
                      {
                        "--trajectory-selection-left": `${visibleRange.value.start * 100}%`,
                        "--trajectory-selection-width": `${(visibleRange.value.end - visibleRange.value.start) * 100}%`,
                      } as CSSProperties
                    }
                  />
                  <div
                    class={css.selectionEdges}
                    data-dragging={draft.value === null ? undefined : "true"}
                    aria-hidden="true"
                    style={
                      {
                        "--trajectory-selection-left": `${visibleRange.value.start * 100}%`,
                        "--trajectory-selection-width": `${(visibleRange.value.end - visibleRange.value.start) * 100}%`,
                      } as CSSProperties
                    }
                  />
                </>
              )}
              <div
                class={css.turnBoundaries}
                data-animate-viewport={animateViewport.value || undefined}
                aria-hidden="true"
                style={projectedDomainStyle.value}
              >
                {timelineModel.turnBoundaries
                  .filter(
                    (boundary) =>
                      boundary.time > timelineModel.start &&
                      boundary.time >= domainStart.value &&
                      boundary.time <= domainStart.value + domainDuration.value,
                  )
                  .map((boundary) => (
                    <span
                      class={css.turnBoundary}
                      data-turn={boundary.turn}
                      key={boundary.turn}
                      style={
                        {
                          "--trajectory-turn-left": `${((boundary.time - timelineModel.start) / fullDuration.value) * 100}%`,
                        } as CSSProperties
                      }
                    />
                  ))}
              </div>
              <div
                class={css.lanes}
                data-animate-viewport={animateViewport.value || undefined}
                data-timeline-domain
                style={projectedDomainStyle.value}
              >
                {timelineModel.spans
                  .filter(
                    (span) =>
                      span.index === _selectedIndex ||
                      (span.end >= domainStart.value &&
                        span.start <= domainStart.value + domainDuration.value),
                  )
                  .map((span) => {
                    const left =
                      (span.start - timelineModel.start) / fullDuration.value;
                    const width = (span.end - span.start) / fullDuration.value;
                    const widthPercent = width * 100;
                    const detail = detailByIndex.value.get(span.index);
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
                        label={timelineTooltipLabel(span.kind, detail, t.value)}
                        side="bottom"
                        delayMs={TIMELINE_TOOLTIP_DELAY_MS}
                      >
                        <span
                          aria-hidden="true"
                          class={css.span}
                          data-timeline-span={span.kind}
                          data-timeline-record-index={span.index}
                          data-assistant-timing={
                            ttftFraction === null ? undefined : "true"
                          }
                          data-error={span.isError || undefined}
                          data-equal-duration={
                            mode.value === "time" || undefined
                          }
                          data-current={
                            span.index === _selectedIndex || undefined
                          }
                          data-hovered={
                            hover.value?.recordIndex === span.index || undefined
                          }
                          data-search-match={
                            _searchMatchIndexes === null
                              ? undefined
                              : _searchMatchIndexes.has(span.index)
                                ? "true"
                                : "false"
                          }
                          data-selected={
                            activeRange.value === null
                              ? undefined
                              : span.start <= activeRange.value.end &&
                                  span.end >= activeRange.value.start
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
    };
  },
  {
    name: "TrajectoryTimeline",
    inheritAttrs: false,
    props: [
      "t",
      "turns",
      "mode",
      "range",
      "hasEarlierRecords",
      "onLoadEarlier",
      "selectedIndex",
      "searchMatchIndexes",
      "onRangeChange",
      "onRecordSelect",
      "onRecordFocus",
    ],
  },
);
