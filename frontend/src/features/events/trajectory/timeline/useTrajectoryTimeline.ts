import type {
  HoverPoint,
  PanGesture,
  TrajectoryTimelineProps,
} from "@/features/events/trajectory/timeline/model";
import {
  centeredRange,
  clampFraction,
  orderedRange,
  rangeFraction,
  timelineRecordDetail,
} from "@/features/events/trajectory/timeline/model";
import type { TrajectoryTimeRange } from "@/features/events/trajectory/timeline/timeline";
import { deriveTrajectoryTimeline } from "@/features/events/trajectory/timeline/timeline";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import {
  computed,
  shallowReactive,
  shallowRef,
  toValue,
  type CSSProperties,
  type MaybeRefOrGetter,
} from "vue";
const MINIMUM_DRAG_PX = 3;
const MINIMUM_ZOOM_OPERATIONS = 4;
const EDGE_PAN_ZONE_FRACTION = 0.08;
const EDGE_PAN_STEP_FRACTION = 0.025;
const MAXIMUM_EDGE_PAN_PX = 32;
export function useTrajectoryTimeline(
  source: MaybeRefOrGetter<TrajectoryTimelineProps>,
) {
  const turns = computed(() => toValue(source).turns),
    mode = computed(() => toValue(source).mode),
    range = computed(() => toValue(source).range),
    hasEarlierRecords = computed(() =>
      toValue(source).hasEarlierRecords === undefined
        ? false
        : toValue(source).hasEarlierRecords,
    ),
    onLoadEarlier = computed(() => toValue(source).onLoadEarlier),
    selectedIndex = computed(() =>
      toValue(source).selectedIndex === undefined
        ? null
        : toValue(source).selectedIndex,
    ),
    onRangeChange = computed(() => toValue(source).onRangeChange),
    onRecordSelect = computed(() => toValue(source).onRecordSelect),
    onRecordFocus = computed(() => toValue(source).onRecordFocus);
  const model = computed(() =>
    deriveTrajectoryTimeline(turns.value, mode.value),
  );
  const detailByIndex = computed(
    () =>
      new Map(
        turns.value.flatMap((turn) =>
          turn.groups.flatMap((group) =>
            group.cells.map(
              (cell) => [cell.index, timelineRecordDetail(cell)] as const,
            ),
          ),
        ),
      ),
  );
  const dragRef = shallowRef<{
    pointerId: number;
    anchorTime: number;
    anchorClientX: number;
    recordIndex: number | null;
  } | null>(null);
  const panRef = shallowRef<PanGesture | null>(null);
  const rootRef = shallowRef<HTMLElement | null>(null);
  const trackRef = shallowRef<HTMLDivElement | null>(null);
  const draft = shallowRef<TrajectoryTimeRange | null>(null),
    setDraft = refSetter(draft);
  const hover = shallowRef<HoverPoint | null>(null),
    setHover = refSetter(hover);
  const loadingEarlier = shallowRef(false),
    setLoadingEarlier = refSetter(loadingEarlier);
  const panning = shallowRef(false),
    setPanning = refSetter(panning);
  const viewport = shallowRef<TrajectoryTimeRange | null>(null),
    setViewport = refSetter(viewport);
  const animateViewport = shallowRef(false),
    setAnimateViewport = refSetter(animateViewport);
  watchMounted(
    [() => model.value, () => onRangeChange.value, () => range.value],
    () => {
      if (
        model.value !== null &&
        range.value !== null &&
        (range.value.end < model.value.start ||
          range.value.start > model.value.end)
      ) {
        onRangeChange.value(null);
      }
    },
  );
  watchMounted([() => model.value], () => {
    const currentModel = model.value;
    if (currentModel === null) return;
    setAnimateViewport(false);
    setViewport((current) =>
      current !== null &&
      (current.end < currentModel.start || current.start > currentModel.end)
        ? null
        : current,
    );
  });
  watchMounted([() => model.value, () => selectedIndex.value], () => {
    const currentModel = model.value;
    if (currentModel === null || selectedIndex.value === null) return;
    const selectedSpan = currentModel.spans.find(
      (span) => span.index === selectedIndex.value,
    );
    if (selectedSpan === undefined) return;
    setAnimateViewport(true);
    setViewport((current) => {
      if (current === null) return current;
      if (selectedSpan.end > current.start && selectedSpan.start < current.end)
        return current;
      const duration = Math.max(1, current.end - current.start);
      const desiredStart =
        selectedSpan.end <= current.start
          ? selectedSpan.start
          : selectedSpan.end - duration;
      const nextStart = Math.min(
        Math.max(desiredStart, currentModel.start),
        Math.max(currentModel.start, currentModel.end - duration),
      );
      if (nextStart === current.start) return current;
      return {
        start: nextStart,
        end: nextStart + duration,
      };
    });
  });
  const fullDuration = computed(() =>
    Math.max(1, (model.value?.end ?? 0) - (model.value?.start ?? 0)),
  );
  const viewportDuration = computed(() =>
    Math.min(
      fullDuration.value,
      Math.max(1, (viewport.value?.end ?? 0) - (viewport.value?.start ?? 0)),
    ),
  );
  const viewportStart = computed(() =>
    model.value === null || viewport.value === null
      ? (model.value?.start ?? 0)
      : Math.min(
          Math.max(viewport.value.start, model.value.start),
          model.value.end - viewportDuration.value,
        ),
  );
  const domainDuration = computed(() =>
    viewport.value === null ? fullDuration.value : viewportDuration.value,
  );
  const domainStart = computed(() =>
    viewport.value === null ? (model.value?.start ?? 0) : viewportStart.value,
  );
  const showsEarlierBoundary = computed(
    () =>
      hasEarlierRecords.value &&
      model.value !== null &&
      domainStart.value === model.value.start,
  );
  const loadEarlier = computed(() =>
    onLoadEarlier.value === undefined || loadingEarlier.value
      ? undefined
      : () => {
          setLoadingEarlier(true);
          void onLoadEarlier.value?.().finally(() => {
            setLoadingEarlier(false);
          });
        },
  );
  const projectedDomainStyle = computed(() =>
    model.value === null
      ? undefined
      : ({
          "--trajectory-domain-left": `${(-(domainStart.value - model.value.start) / domainDuration.value) * 100}%`,
          "--trajectory-domain-width": `${(fullDuration.value / domainDuration.value) * 100}%`,
        } as CSSProperties),
  );
  const committed = computed(() =>
    model.value === null || range.value === null
      ? null
      : rangeFraction(
          range.value,
          domainStart.value,
          domainDuration.value,
          model.value.start,
          model.value.end,
        ),
  );
  const draftFraction = computed(() =>
    model.value === null || draft.value === null
      ? null
      : rangeFraction(
          draft.value,
          domainStart.value,
          domainDuration.value,
          model.value.start,
          model.value.end,
        ),
  );
  const visibleRange = computed(() => draftFraction.value ?? committed.value);
  const activeRange = computed(() => draft.value ?? range.value);
  watchMounted(
    [
      () => domainDuration.value,
      () => domainStart.value,
      () => fullDuration.value,
      () => mode.value,
      () => model.value,
    ],
    () => {
      const root = rootRef.value;
      if (root === null) return;
      const onWheel = (event: globalThis.WheelEvent): void => {
        event.preventDefault();
        const track = trackRef.value;
        if (track === null || model.value === null) return;
        setAnimateViewport(false);
        const rect = track.getBoundingClientRect();
        const anchorFraction = clampFraction(
          (event.clientX - rect.left) / Math.max(1, rect.width),
        );
        const nextDuration = Math.min(
          fullDuration.value,
          Math.max(
            Math.min(
              mode.value === "sequence" ? MINIMUM_ZOOM_OPERATIONS : 20,
              fullDuration.value,
            ),
            domainDuration.value * Math.exp(event.deltaY * 0.0015),
          ),
        );
        if (nextDuration >= fullDuration.value * 0.999) {
          setViewport(null);
          return;
        }
        const anchorTime =
          domainStart.value + anchorFraction * domainDuration.value;
        const nextStart = Math.min(
          Math.max(
            anchorTime - anchorFraction * nextDuration,
            model.value.start,
          ),
          model.value.end - nextDuration,
        );
        setViewport({
          start: nextStart,
          end: nextStart + nextDuration,
        });
      };
      root.addEventListener("wheel", onWheel, {
        passive: false,
      });
      return () => {
        root.removeEventListener("wheel", onWheel);
      };
    },
  );
  const minimumSelectionDuration = computed(() =>
    Math.min(
      domainDuration.value,
      fullDuration.value / Math.max(1, model.value?.spans.length ?? 0),
    ),
  );
  const fractionAt = (event: PointerEvent): number => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return clampFraction((event.clientX - rect.left) / Math.max(1, rect.width));
  };
  const recordIndexAt = (event: PointerEvent): number | null => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const value = target?.closest<HTMLElement>("[data-timeline-record-index]")
      ?.dataset.timelineRecordIndex;
    if (value === undefined) return null;
    const index = Number(value);
    return Number.isFinite(index) ? index : null;
  };
  const commit = (nextRange: TrajectoryTimeRange) => {
    onRangeChange.value(nextRange);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button === 2) {
      panRef.value = {
        anchorClientX: event.clientX,
        anchorStart: domainStart.value,
        moved: false,
        pannable: viewport.value !== null,
        pointerId: event.pointerId,
      };
      if (viewport.value !== null) setAnimateViewport(false);
      setPanning(true);
      if (
        typeof (event.currentTarget as HTMLElement).setPointerCapture ===
        "function"
      ) {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      }
      return;
    }
    if (event.button !== 0) return;
    const anchor = fractionAt(event);
    const anchorTime = domainStart.value + anchor * domainDuration.value;
    const recordIndex = recordIndexAt(event);
    setHover({
      fraction: anchor,
      recordIndex,
    });
    dragRef.value = {
      pointerId: event.pointerId,
      anchorTime,
      anchorClientX: event.clientX,
      recordIndex,
    };
    if (
      typeof (event.currentTarget as HTMLElement).setPointerCapture ===
      "function"
    ) {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    setDraft({
      start: anchorTime,
      end: anchorTime,
    });
  };
  const onPointerMove = (event: PointerEvent) => {
    if (model.value === null) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const fraction = fractionAt(event);
    setHover({
      fraction,
      recordIndex: recordIndexAt(event),
    });
    const pan = panRef.value;
    if (pan !== null && pan.pointerId === event.pointerId) {
      if (Math.abs(event.clientX - pan.anchorClientX) >= MINIMUM_DRAG_PX) {
        pan.moved = true;
      }
      if (!pan.pannable) return;
      const delta =
        (event.clientX - pan.anchorClientX) / Math.max(1, rect.width);
      const nextStart = Math.min(
        Math.max(
          pan.anchorStart - delta * domainDuration.value,
          model.value.start,
        ),
        model.value.end - domainDuration.value,
      );
      setViewport({
        start: nextStart,
        end: nextStart + domainDuration.value,
      });
      return;
    }
    const drag = dragRef.value;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    let nextDomainStart = domainStart.value;
    if (viewport.value !== null) {
      const localX = event.clientX - rect.left;
      const edgeWidth = Math.min(
        MAXIMUM_EDGE_PAN_PX,
        Math.max(1, rect.width * EDGE_PAN_ZONE_FRACTION),
      );
      const direction =
        localX < edgeWidth ? -1 : localX > rect.width - edgeWidth ? 1 : 0;
      if (direction !== 0) {
        const edgeDistance =
          direction < 0
            ? edgeWidth - localX
            : localX - (rect.width - edgeWidth);
        const strength = clampFraction(edgeDistance / edgeWidth);
        const desiredStart =
          domainStart.value +
          direction *
            domainDuration.value *
            EDGE_PAN_STEP_FRACTION *
            Math.max(0.2, strength);
        nextDomainStart = Math.min(
          Math.max(desiredStart, model.value.start),
          model.value.end - domainDuration.value,
        );
        if (nextDomainStart !== domainStart.value) {
          setAnimateViewport(false);
          setViewport({
            start: nextDomainStart,
            end: nextDomainStart + domainDuration.value,
          });
        }
      }
    }
    const pointTime = nextDomainStart + fraction * domainDuration.value;
    setDraft(orderedRange(drag.anchorTime, pointTime));
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (model.value === null) return;
    const pan = panRef.value;
    if (pan !== null && pan.pointerId === event.pointerId) {
      const moved =
        pan.moved ||
        Math.abs(event.clientX - pan.anchorClientX) >= MINIMUM_DRAG_PX;
      panRef.value = null;
      setPanning(false);
      if (!moved) onRangeChange.value(null);
      return;
    }
    const drag = dragRef.value;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const pointFraction = fractionAt(event);
    const pointTime = domainStart.value + pointFraction * domainDuration.value;
    const selected = orderedRange(drag.anchorTime, pointTime);
    setHover({
      fraction: pointFraction,
      recordIndex: recordIndexAt(event),
    });
    dragRef.value = null;
    setDraft(null);
    const click =
      Math.abs(event.clientX - drag.anchorClientX) < MINIMUM_DRAG_PX;
    const clickedSpan =
      click && drag.recordIndex !== null
        ? model.value.spans.find((span) => span.index === drag.recordIndex)
        : undefined;
    if (clickedSpan !== undefined) {
      onRangeChange.value(null);
      onRecordSelect.value?.(clickedSpan.index);
      return;
    }
    const committedRange =
      selected.end - selected.start < minimumSelectionDuration.value
        ? centeredRange(
            click ? selected.start : (selected.start + selected.end) / 2,
            minimumSelectionDuration.value,
            model.value.start,
            model.value.end,
          )
        : selected;
    commit(committedRange);
    if (click) {
      const timelinePoint = selected.start;
      const nearest = model.value.spans.reduce((candidate, span) => {
        const candidateDistance =
          timelinePoint < candidate.start
            ? candidate.start - timelinePoint
            : timelinePoint > candidate.end
              ? timelinePoint - candidate.end
              : 0;
        const spanDistance =
          timelinePoint < span.start
            ? span.start - timelinePoint
            : timelinePoint > span.end
              ? timelinePoint - span.end
              : 0;
        return spanDistance < candidateDistance ? span : candidate;
      });
      onRecordFocus.value?.(nearest.index);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || range.value === null) return;
    event.preventDefault();
    onRangeChange.value(null);
  };
  const onPointerCancel = () => {
    dragRef.value = null;
    panRef.value = null;
    setDraft(null);
    setHover(null);
    setPanning(false);
  };
  return shallowReactive({
    get model() {
      return model.value;
    },
    get rootRef() {
      return rootRef;
    },
    get loadingEarlier() {
      return loadingEarlier.value;
    },
    get setHover() {
      return setHover;
    },
    get loadEarlier() {
      return loadEarlier.value;
    },
    get detailByIndex() {
      return detailByIndex.value;
    },
    get dragRef() {
      return dragRef;
    },
    get panRef() {
      return panRef;
    },
    get trackRef() {
      return trackRef;
    },
    get draft() {
      return draft.value;
    },
    get hover() {
      return hover.value;
    },
    get panning() {
      return panning.value;
    },
    get animateViewport() {
      return animateViewport.value;
    },
    get fullDuration() {
      return fullDuration.value;
    },
    get domainDuration() {
      return domainDuration.value;
    },
    get domainStart() {
      return domainStart.value;
    },
    get showsEarlierBoundary() {
      return showsEarlierBoundary.value;
    },
    get projectedDomainStyle() {
      return projectedDomainStyle.value;
    },
    get visibleRange() {
      return visibleRange.value;
    },
    get activeRange() {
      return activeRange.value;
    },
    get onKeyDown() {
      return onKeyDown;
    },
    get onPointerDown() {
      return onPointerDown;
    },
    get onPointerMove() {
      return onPointerMove;
    },
    get onPointerEnd() {
      return onPointerEnd;
    },
    get onPointerCancel() {
      return onPointerCancel;
    },
  });
}
