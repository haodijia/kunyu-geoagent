import { useCallback, useEffect, useRef } from "react";

export interface PreviewScrollTarget {
  getPercent(): number;
  scrollToPercent(percent: number): void;
}
type Side = "source" | "preview";

export function scrollPercent(element: HTMLElement): number {
  const range = element.scrollHeight - element.clientHeight;
  return range > 0 ? Math.max(0, Math.min(1, element.scrollTop / range)) : 0;
}

export function elementScrollTarget(element: HTMLElement): PreviewScrollTarget {
  return {
    getPercent: () => scrollPercent(element),
    scrollToPercent: percent => element.scrollTo({ top: percent * Math.max(0, element.scrollHeight - element.clientHeight), behavior: "instant" }),
  };
}

export function usePreviewScrollSync(enabled: boolean) {
  const active = useRef(enabled); active.current = enabled;
  const targets = useRef<Partial<Record<Side, PreviewScrollTarget>>>({});
  const expected = useRef<Partial<Record<Side, number>>>({});
  const locked = useRef<Side | null>(null);
  const animation = useRef<number | null>(null);
  const write = useCallback((side: Side, percent: number) => {
    const target = targets.current[side];
    if (target === undefined) return;
    expected.current[side] = percent;
    locked.current = side;
    target.scrollToPercent(percent);
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = requestAnimationFrame(() => {
      animation.current = requestAnimationFrame(() => { locked.current = null; animation.current = null; });
    });
  }, []);
  const receive = useCallback((side: Side, percent: number) => {
    if (!active.current) return;
    const echo = expected.current[side];
    if (locked.current === side || (echo !== undefined && Math.abs(echo - percent) < 0.002)) {
      delete expected.current[side];
      return;
    }
    delete expected.current[side];
    write(side === "source" ? "preview" : "source", percent);
  }, [write]);
  const register = useCallback((side: Side, target: PreviewScrollTarget | null) => {
    delete expected.current[side];
    if (target === null) delete targets.current[side];
    else {
      targets.current[side] = target;
      const other = targets.current[side === "source" ? "preview" : "source"];
      if (active.current && other !== undefined) write(side, other.getPercent());
    }
  }, [write]);
  useEffect(() => {
    if (!enabled) {
      expected.current = {}; locked.current = null;
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      animation.current = null;
    }
  }, [enabled]);
  useEffect(() => () => { if (animation.current !== null) cancelAnimationFrame(animation.current); }, []);
  const sourceTarget = useCallback((target: PreviewScrollTarget | null) => register("source", target), [register]);
  const previewTarget = useCallback((target: PreviewScrollTarget | null) => register("preview", target), [register]);
  const sourceScrolled = useCallback((percent: number) => receive("source", percent), [receive]);
  const previewScrolled = useCallback((percent: number) => receive("preview", percent), [receive]);
  return { sourceTarget, previewTarget, sourceScrolled, previewScrolled };
}
