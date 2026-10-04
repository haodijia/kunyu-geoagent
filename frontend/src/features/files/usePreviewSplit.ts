import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import { zhCN } from "@/locales/zh-CN";

const KEY = "kunyu:file-split-ratio";
const DEFAULT = 50;
const clamp = (value: number) => Math.max(20, Math.min(80, value));
function readRatio(): number {
  const stored = localStorage.getItem(KEY);
  if (stored === null) return DEFAULT;
  const value: unknown = JSON.parse(stored);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 20 || value > 80) throw new Error("Invalid stored file split ratio.");
  return value;
}

export function usePreviewSplit() {
  const [ratio, setRatio] = useState(readRatio);
  const current = useRef(ratio); current.current = ratio;
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ id: number; startX: number; ratio: number; width: number } | null>(null);
  const persist = useCallback((value: number) => {
    try { localStorage.setItem(KEY, JSON.stringify(value)); setError(null); }
    catch (error) { console.error("[files] Split preference save failed.", error); setError(zhCN.filePreview.splitStorageFailed); }
  }, []);
  const finish = useCallback(() => {
    if (drag.current === null) return;
    drag.current = null; setDragging(false); persist(current.current);
  }, [persist]);
  useEffect(() => {
    window.addEventListener("blur", finish);
    return () => window.removeEventListener("blur", finish);
  }, [finish]);
  const update = (value: number) => { current.current = clamp(value); setRatio(current.current); };
  return {
    ratio, dragging, error,
    separator: {
      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || drag.current !== null) return;
        event.preventDefault();
        const width = event.currentTarget.parentElement!.parentElement!.getBoundingClientRect().width;
        if (width <= 0) throw new Error("A split preview has no measurable width.");
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, startX: event.clientX, ratio: current.current, width };
        setDragging(true);
      },
      onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
        const start = drag.current;
        if (start !== null && start.id === event.pointerId) update(start.ratio + (event.clientX - start.startX) / start.width * 100);
      },
      onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
        const start = drag.current;
        if (start === null || start.id !== event.pointerId) return;
        update(start.ratio + (event.clientX - start.startX) / start.width * 100);
        finish();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      },
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onDoubleClick: () => { update(DEFAULT); persist(DEFAULT); },
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        const value = event.key === "ArrowLeft" ? current.current - 2 : event.key === "ArrowRight" ? current.current + 2 : event.key === "Home" ? 20 : event.key === "End" ? 80 : null;
        if (value === null) return;
        event.preventDefault(); update(value); persist(current.current);
      },
    },
  };
}
