/** Hover geometry and rail interaction adapted from Mu (Apache-2.0). */
import {
  needsScroll,
  resolveScrollTopForIndex,
  resolveStackTop,
  resolveTickIndexAtOffset,
  resolveViewportHeight,
  TICK_GAP,
  tickCenterOffset,
  tickStackHeight,
} from "@/features/messages/navigation/geometry";
import styles from "@/features/messages/navigation/MessageAnchorRail.module.css";
import { useMessageNavigation } from "@/features/messages/navigation/MessageNavigationContext";
import { truncate } from "@/features/messages/navigation/model";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const content = zhCN.conversation.navigation;
function tone(distance: number): string | undefined {
  return distance === 0 ? styles.tickActive : distance === 1 ? styles.tickNear : distance === 2 ? styles.tickFar : undefined;
}

export function MessageAnchorRail() {
  const { anchors, jump } = useMessageNavigation();
  const [railNode, setRailNode] = useState<HTMLElement | null>(null);
  const [railHeight, setRailHeight] = useState(0), [cardHeight, setCardHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null), [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null), cardRef = useRef<HTMLButtonElement>(null);
  const pointerY = useRef<number | null>(null), followedCount = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepPreview = () => { if (closeTimer.current !== null) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const closePreview = () => { keepPreview(); closeTimer.current = setTimeout(() => setActiveIndex(null), 100); };
  useEffect(() => keepPreview, []);
  useEffect(() => {
    const host = railNode?.parentElement;
    if (host === null || host === undefined) return;
    const measure = () => setRailHeight(host.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure); observer.observe(host); measure();
    return () => observer.disconnect();
  }, [railNode]);
  useLayoutEffect(() => { if (cardRef.current !== null) setCardHeight(cardRef.current.getBoundingClientRect().height); }, [activeIndex, anchors]);
  useEffect(() => { setActiveIndex((current) => current !== null && current >= anchors.length ? null : current); }, [anchors.length]);
  const stackHeight = tickStackHeight(anchors.length), viewportHeight = resolveViewportHeight(railHeight, anchors.length);
  const scrollable = needsScroll(railHeight, anchors.length), stackTop = resolveStackTop(railHeight, anchors.length);
  const selectAtPointer = useCallback(() => {
    if (viewportRef.current === null || pointerY.current === null) return;
    setActiveIndex(resolveTickIndexAtOffset(pointerY.current + viewportRef.current.scrollTop, anchors.length));
  }, [anchors.length]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null || !scrollable || followedCount.current === anchors.length) return;
    followedCount.current = anchors.length;
    viewport.scrollTop = resolveScrollTopForIndex(anchors.length - 1, anchors.length, viewportHeight);
  }, [anchors.length, scrollable, viewportHeight]);
  function focus(index: number) {
    pointerY.current = null;
    keepPreview();
    setActiveIndex(index);
    if (viewportRef.current !== null && scrollable) viewportRef.current.scrollTop = resolveScrollTopForIndex(index, anchors.length, viewportHeight);
  }
  if (anchors.length < 2) return null;
  const active = activeIndex === null ? undefined : anchors[activeIndex];
  const center = activeIndex === null ? 0 : stackTop + tickCenterOffset(activeIndex) - scrollTop;
  const cardTop = Math.min(Math.max(center - cardHeight / 2, 8), Math.max(8, railHeight - cardHeight - 8));
  return <nav ref={setRailNode} className={cn(styles.rail, "absolute inset-y-0 start-0 z-20")} aria-label={content.label} data-message-anchor-rail>
    <div ref={viewportRef} className={cn(styles.viewport, scrollable && styles.viewportScrollable)} style={{ top: stackTop, height: viewportHeight }} data-anchor-zone data-scrollable={scrollable}
      onPointerMove={(event) => { keepPreview(); pointerY.current = event.clientY - event.currentTarget.getBoundingClientRect().top; selectAtPointer(); }}
      onPointerLeave={() => { pointerY.current = null; closePreview(); }}
      onScroll={(event) => { setScrollTop(event.currentTarget.scrollTop); selectAtPointer(); }}
      onClick={() => { if (active !== undefined) jump(active.messageId); }}>
      <div className={styles.ticks} style={{ height: stackHeight, rowGap: TICK_GAP }}>
        {anchors.map((anchor, index) => <span key={anchor.messageId} role="button" tabIndex={0} className={cn(styles.tick, activeIndex !== null && tone(Math.abs(index - activeIndex)))} data-anchor-index={anchor.index} data-anchor-active={activeIndex === index ? true : undefined}
          aria-label={content.turn(anchor.index)} onFocus={() => focus(index)} onBlur={() => setActiveIndex((current) => current === index ? null : current)}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); jump(anchor.messageId); } }} />)}
      </div>
    </div>
    {scrollable && scrollTop > 1 && <div className={cn(styles.scrollHint, styles.scrollHintUp)} style={{ top: stackTop - 7 }} aria-hidden="true"><span className={styles.scrollHintDot}/><span className={styles.scrollHintDot}/><span className={styles.scrollHintDot}/></div>}
    {scrollable && scrollTop + viewportHeight < stackHeight - 1 && <div className={cn(styles.scrollHint, styles.scrollHintDown)} style={{ top: stackTop + viewportHeight + 7 }} aria-hidden="true"><span className={styles.scrollHintDot}/><span className={styles.scrollHintDot}/><span className={styles.scrollHintDot}/></div>}
    {active !== undefined && <button type="button" ref={cardRef} className={styles.card} style={{ top: cardTop }} onClick={() => jump(active.messageId)} onPointerEnter={keepPreview} onPointerLeave={closePreview} data-anchor-preview>
      <span className={cn(styles.cardQuestion, "text-start text-[13px] font-medium leading-[18px] text-t-primary")}>{truncate(active.question)}</span>
      {active.answer !== "" && <span className={cn(styles.cardAnswer, "text-start text-xs leading-[18px] text-t-secondary")}>{truncate(active.answer)}</span>}
    </button>}
  </nav>;
}
