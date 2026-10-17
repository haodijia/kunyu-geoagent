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
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const MINIMUM_DRAG_PX = 3;

const MINIMUM_ZOOM_OPERATIONS = 4;

const EDGE_PAN_ZONE_FRACTION = 0.08;

const EDGE_PAN_STEP_FRACTION = 0.025;

const MAXIMUM_EDGE_PAN_PX = 32;

export function useTrajectoryTimeline({
  turns,
  mode,
  range,
  hasEarlierRecords = false,
  onLoadEarlier,
  selectedIndex = null,
  onRangeChange,
  onRecordSelect,
  onRecordFocus,
}: TrajectoryTimelineProps) {
  const model = useMemo(
    () => deriveTrajectoryTimeline(turns, mode),
    [mode, turns],
  );
  const detailByIndex = useMemo(
    () =>
      new Map(
        turns.flatMap((turn) =>
          turn.groups.flatMap((group) =>
            group.cells.map(
              (cell) => [cell.index, timelineRecordDetail(cell)] as const,
            ),
          ),
        ),
      ),
    [turns],
  );
  const dragRef = useRef<{
    pointerId: number;
    anchorTime: number;
    anchorClientX: number;
    recordIndex: number | null;
  } | null>(null);
  const panRef = useRef<PanGesture | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<TrajectoryTimeRange | null>(null);
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [panning, setPanning] = useState(false);
  const [viewport, setViewport] = useState<TrajectoryTimeRange | null>(null);
  const [animateViewport, setAnimateViewport] = useState(false);
  useEffect(() => {
    if (
      model !== null &&
      range !== null &&
      (range.end < model.start || range.start > model.end)
    ) {
      onRangeChange(null);
    }
  }, [model, onRangeChange, range]);
  useEffect(() => {
    if (model === null) return;
    setAnimateViewport(false);
    setViewport((current) =>
      current !== null &&
      (current.end < model.start || current.start > model.end)
        ? null
        : current,
    );
  }, [model]);
  useEffect(() => {
    if (model === null || selectedIndex === null) return;
    const selectedSpan = model.spans.find(
      (span) => span.index === selectedIndex,
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
        Math.max(desiredStart, model.start),
        Math.max(model.start, model.end - duration),
      );
      if (nextStart === current.start) return current;
      return { start: nextStart, end: nextStart + duration };
    });
  }, [model, selectedIndex]);
  const fullDuration = Math.max(1, (model?.end ?? 0) - (model?.start ?? 0));
  const viewportDuration = Math.min(
    fullDuration,
    Math.max(1, (viewport?.end ?? 0) - (viewport?.start ?? 0)),
  );
  const viewportStart =
    model === null || viewport === null
      ? (model?.start ?? 0)
      : Math.min(
          Math.max(viewport.start, model.start),
          model.end - viewportDuration,
        );
  const domainDuration = viewport === null ? fullDuration : viewportDuration;
  const domainStart = viewport === null ? (model?.start ?? 0) : viewportStart;
  const showsEarlierBoundary =
    hasEarlierRecords && model !== null && domainStart === model.start;
  const loadEarlier =
    onLoadEarlier === undefined || loadingEarlier
      ? undefined
      : () => {
          setLoadingEarlier(true);
          void onLoadEarlier().finally(() => {
            setLoadingEarlier(false);
          });
        };
  const projectedDomainStyle =
    model === null
      ? undefined
      : ({
          "--trajectory-domain-left": `${(-(domainStart - model.start) / domainDuration) * 100}%`,
          "--trajectory-domain-width": `${(fullDuration / domainDuration) * 100}%`,
        } as CSSProperties);
  const committed =
    model === null || range === null
      ? null
      : rangeFraction(
          range,
          domainStart,
          domainDuration,
          model.start,
          model.end,
        );
  const draftFraction =
    model === null || draft === null
      ? null
      : rangeFraction(
          draft,
          domainStart,
          domainDuration,
          model.start,
          model.end,
        );
  const visibleRange = draftFraction ?? committed;
  const activeRange = draft ?? range;
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const onWheel = (event: globalThis.WheelEvent): void => {
      event.preventDefault();
      const track = trackRef.current;
      if (track === null || model === null) return;
      setAnimateViewport(false);
      const rect = track.getBoundingClientRect();
      const anchorFraction = clampFraction(
        (event.clientX - rect.left) / Math.max(1, rect.width),
      );
      const nextDuration = Math.min(
        fullDuration,
        Math.max(
          Math.min(
            mode === "sequence" ? MINIMUM_ZOOM_OPERATIONS : 20,
            fullDuration,
          ),
          domainDuration * Math.exp(event.deltaY * 0.0015),
        ),
      );
      if (nextDuration >= fullDuration * 0.999) {
        setViewport(null);
        return;
      }
      const anchorTime = domainStart + anchorFraction * domainDuration;
      const nextStart = Math.min(
        Math.max(anchorTime - anchorFraction * nextDuration, model.start),
        model.end - nextDuration,
      );
      setViewport({ start: nextStart, end: nextStart + nextDuration });
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", onWheel);
    };
  }, [domainDuration, domainStart, fullDuration, mode, model]);

  if (model === null)
    return { model, rootRef, loadingEarlier, setHover, loadEarlier };

  const minimumSelectionDuration = Math.min(
    domainDuration,
    fullDuration / model.spans.length,
  );

  const fractionAt = (event: PointerEvent<HTMLDivElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    return clampFraction((event.clientX - rect.left) / Math.max(1, rect.width));
  };

  const recordIndexAt = (
    event: PointerEvent<HTMLDivElement>,
  ): number | null => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const value = target?.closest<HTMLElement>("[data-timeline-record-index]")
      ?.dataset.timelineRecordIndex;
    if (value === undefined) return null;
    const index = Number(value);
    return Number.isFinite(index) ? index : null;
  };

  const commit = (nextRange: TrajectoryTimeRange) => {
    onRangeChange(nextRange);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button === 2) {
      panRef.current = {
        anchorClientX: event.clientX,
        anchorStart: domainStart,
        moved: false,
        pannable: viewport !== null,
        pointerId: event.pointerId,
      };
      if (viewport !== null) setAnimateViewport(false);
      setPanning(true);
      if (typeof event.currentTarget.setPointerCapture === "function") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (event.button !== 0) return;
    const anchor = fractionAt(event);
    const anchorTime = domainStart + anchor * domainDuration;
    const recordIndex = recordIndexAt(event);
    setHover({ fraction: anchor, recordIndex });
    dragRef.current = {
      pointerId: event.pointerId,
      anchorTime,
      anchorClientX: event.clientX,
      recordIndex,
    };
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDraft({ start: anchorTime, end: anchorTime });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = fractionAt(event);
    setHover({ fraction, recordIndex: recordIndexAt(event) });
    const pan = panRef.current;
    if (pan !== null && pan.pointerId === event.pointerId) {
      if (Math.abs(event.clientX - pan.anchorClientX) >= MINIMUM_DRAG_PX) {
        pan.moved = true;
      }
      if (!pan.pannable) return;
      const delta =
        (event.clientX - pan.anchorClientX) / Math.max(1, rect.width);
      const nextStart = Math.min(
        Math.max(pan.anchorStart - delta * domainDuration, model.start),
        model.end - domainDuration,
      );
      setViewport({ start: nextStart, end: nextStart + domainDuration });
      return;
    }
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    let nextDomainStart = domainStart;
    if (viewport !== null) {
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
          domainStart +
          direction *
            domainDuration *
            EDGE_PAN_STEP_FRACTION *
            Math.max(0.2, strength);
        nextDomainStart = Math.min(
          Math.max(desiredStart, model.start),
          model.end - domainDuration,
        );
        if (nextDomainStart !== domainStart) {
          setAnimateViewport(false);
          setViewport({
            start: nextDomainStart,
            end: nextDomainStart + domainDuration,
          });
        }
      }
    }
    const pointTime = nextDomainStart + fraction * domainDuration;
    setDraft(orderedRange(drag.anchorTime, pointTime));
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan !== null && pan.pointerId === event.pointerId) {
      const moved =
        pan.moved ||
        Math.abs(event.clientX - pan.anchorClientX) >= MINIMUM_DRAG_PX;
      panRef.current = null;
      setPanning(false);
      if (!moved) onRangeChange(null);
      return;
    }
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const pointFraction = fractionAt(event);
    const pointTime = domainStart + pointFraction * domainDuration;
    const selected = orderedRange(drag.anchorTime, pointTime);
    setHover({ fraction: pointFraction, recordIndex: recordIndexAt(event) });
    dragRef.current = null;
    setDraft(null);
    const click =
      Math.abs(event.clientX - drag.anchorClientX) < MINIMUM_DRAG_PX;
    const clickedSpan =
      click && drag.recordIndex !== null
        ? model.spans.find((span) => span.index === drag.recordIndex)
        : undefined;
    if (clickedSpan !== undefined) {
      onRangeChange(null);
      onRecordSelect?.(clickedSpan.index);
      return;
    }
    const committedRange =
      selected.end - selected.start < minimumSelectionDuration
        ? centeredRange(
            click ? selected.start : (selected.start + selected.end) / 2,
            minimumSelectionDuration,
            model.start,
            model.end,
          )
        : selected;
    commit(committedRange);
    if (click) {
      const timelinePoint = selected.start;
      const nearest = model.spans.reduce((candidate, span) => {
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
      onRecordFocus?.(nearest.index);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || range === null) return;
    event.preventDefault();
    onRangeChange(null);
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    panRef.current = null;
    setDraft(null);
    setHover(null);
    setPanning(false);
  };

  return {
    model,
    rootRef,
    loadingEarlier,
    setHover,
    loadEarlier,
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
  };
}
