import { refSetter, watchMounted } from "@/lib/lifecycle";
import { computed, defineComponent, shallowRef, toRefs } from "vue";
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
const content = zhCN.conversation.navigation;
function tone(distance: number): string | undefined {
  return distance === 0
    ? styles.tickActive
    : distance === 1
      ? styles.tickNear
      : distance === 2
        ? styles.tickFar
        : undefined;
}
export const MessageAnchorRail = defineComponent(
  (_props, { slots: _slots }) => {
    const { anchors, jump } = toRefs(useMessageNavigation());
    const railNode = shallowRef<HTMLElement | null>(null);
    const railHeight = shallowRef(0),
      cardHeight = shallowRef(0),
      setRailHeight = refSetter(railHeight),
      setCardHeight = refSetter(cardHeight);
    const activeIndex = shallowRef<number | null>(null),
      scrollTop = shallowRef(0),
      setActiveIndex = refSetter(activeIndex),
      setScrollTop = refSetter(scrollTop);
    const viewportRef = shallowRef<HTMLDivElement | null>(null),
      cardRef = shallowRef<HTMLButtonElement | null>(null);
    const pointerY = shallowRef<number | null>(null),
      followedCount = shallowRef(0);
    const closeTimer = shallowRef<ReturnType<typeof setTimeout> | null>(null);
    const keepPreview = () => {
      if (closeTimer.value !== null) {
        clearTimeout(closeTimer.value);
        closeTimer.value = null;
      }
    };
    const closePreview = () => {
      keepPreview();
      closeTimer.value = setTimeout(() => setActiveIndex(null), 100);
    };
    watchMounted([], () => keepPreview);
    watchMounted([() => railNode.value], () => {
      const host = railNode.value?.parentElement;
      if (host === null || host === undefined) return;
      const measure = () => setRailHeight(host.getBoundingClientRect().height);
      const observer = new ResizeObserver(measure);
      observer.observe(host);
      measure();
      return () => observer.disconnect();
    });
    watchMounted([() => activeIndex.value, () => anchors.value], () => {
      if (cardRef.value !== null)
        setCardHeight(cardRef.value.getBoundingClientRect().height);
    });
    watchMounted([() => anchors.value.length], () => {
      setActiveIndex((current) =>
        current !== null && current >= anchors.value.length ? null : current,
      );
    });
    const stackHeight = computed(() => tickStackHeight(anchors.value.length)),
      viewportHeight = computed(() =>
        resolveViewportHeight(railHeight.value, anchors.value.length),
      );
    const scrollable = computed(() =>
        needsScroll(railHeight.value, anchors.value.length),
      ),
      stackTop = computed(() =>
        resolveStackTop(railHeight.value, anchors.value.length),
      );
    const selectAtPointer = () => {
      if (viewportRef.value === null || pointerY.value === null) return;
      setActiveIndex(
        resolveTickIndexAtOffset(
          pointerY.value + viewportRef.value.scrollTop,
          anchors.value.length,
        ),
      );
    };
    watchMounted(
      [
        () => anchors.value.length,
        () => scrollable.value,
        () => viewportHeight.value,
      ],
      () => {
        const viewport = viewportRef.value;
        if (
          viewport === null ||
          !scrollable.value ||
          followedCount.value === anchors.value.length
        )
          return;
        followedCount.value = anchors.value.length;
        viewport.scrollTop = resolveScrollTopForIndex(
          anchors.value.length - 1,
          anchors.value.length,
          viewportHeight.value,
        );
      },
    );
    function focus(index: number) {
      pointerY.value = null;
      keepPreview();
      setActiveIndex(index);
      if (viewportRef.value !== null && scrollable.value)
        viewportRef.value.scrollTop = resolveScrollTopForIndex(
          index,
          anchors.value.length,
          viewportHeight.value,
        );
    }
    const active = computed(() =>
      activeIndex.value === null ? undefined : anchors.value[activeIndex.value],
    );
    const center = computed(() =>
      activeIndex.value === null
        ? 0
        : stackTop.value +
          tickCenterOffset(activeIndex.value) -
          scrollTop.value,
    );
    const cardTop = computed(() =>
      Math.min(
        Math.max(center.value - cardHeight.value / 2, 8),
        Math.max(8, railHeight.value - cardHeight.value - 8),
      ),
    );
    return () => {
      const _scrollable = scrollable.value,
        _stackTop = stackTop.value,
        _viewportHeight = viewportHeight.value,
        _active = active.value,
        _stackHeight = stackHeight.value,
        _cardTop = cardTop.value;
      if (anchors.value.length < 2) return null;
      return (
        <nav
          ref={railNode}
          class={cn(styles.rail, "absolute inset-y-0 start-0 z-20")}
          aria-label={content.label}
          data-message-anchor-rail
        >
          <div
            ref={viewportRef}
            class={cn(
              styles.viewport,
              _scrollable && styles.viewportScrollable,
            )}
            style={{
              top: `${_stackTop}px`,
              height: `${_viewportHeight}px`,
            }}
            data-anchor-zone
            data-scrollable={_scrollable}
            onPointermove={(event) => {
              keepPreview();
              pointerY.value =
                event.clientY -
                (event.currentTarget as HTMLElement).getBoundingClientRect()
                  .top;
              selectAtPointer();
            }}
            onPointerleave={() => {
              pointerY.value = null;
              closePreview();
            }}
            onScroll={(event) => {
              setScrollTop((event.currentTarget as HTMLElement).scrollTop);
              selectAtPointer();
            }}
            onClick={() => {
              if (_active !== undefined) jump.value(_active.messageId);
            }}
          >
            <div
              class={styles.ticks}
              style={{
                height: `${_stackHeight}px`,
                rowGap: `${TICK_GAP}px`,
              }}
            >
              {anchors.value.map((anchor, index) => (
                <span
                  key={anchor.messageId}
                  role="button"
                  tabindex={0}
                  class={cn(
                    styles.tick,
                    activeIndex.value !== null &&
                      tone(Math.abs(index - activeIndex.value)),
                  )}
                  data-anchor-index={anchor.index}
                  data-anchor-active={
                    activeIndex.value === index ? true : undefined
                  }
                  aria-label={content.turn(anchor.index)}
                  onFocus={() => focus(index)}
                  onBlur={() =>
                    setActiveIndex((current) =>
                      current === index ? null : current,
                    )
                  }
                  onKeydown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      jump.value(anchor.messageId);
                    }
                  }}
                />
              ))}
            </div>
          </div>
          {_scrollable && scrollTop.value > 1 && (
            <div
              class={cn(styles.scrollHint, styles.scrollHintUp)}
              style={{
                top: `${_stackTop - 7}px`,
              }}
              aria-hidden="true"
            >
              <span class={styles.scrollHintDot} />
              <span class={styles.scrollHintDot} />
              <span class={styles.scrollHintDot} />
            </div>
          )}
          {_scrollable &&
            scrollTop.value + _viewportHeight < _stackHeight - 1 && (
              <div
                class={cn(styles.scrollHint, styles.scrollHintDown)}
                style={{
                  top: `${_stackTop + _viewportHeight + 7}px`,
                }}
                aria-hidden="true"
              >
                <span class={styles.scrollHintDot} />
                <span class={styles.scrollHintDot} />
                <span class={styles.scrollHintDot} />
              </div>
            )}
          {_active !== undefined && (
            <button
              type="button"
              ref={cardRef}
              class={styles.card}
              style={{
                top: `${_cardTop}px`,
              }}
              onClick={() => jump.value(_active.messageId)}
              onPointerenter={keepPreview}
              onPointerleave={closePreview}
              data-anchor-preview
            >
              <span
                class={cn(
                  styles.cardQuestion,
                  "text-start text-[13px] font-medium leading-[18px] text-t-primary",
                )}
              >
                {truncate(_active.question)}
              </span>
              {_active.answer !== "" && (
                <span
                  class={cn(
                    styles.cardAnswer,
                    "text-start text-xs leading-[18px] text-t-secondary",
                  )}
                >
                  {truncate(_active.answer)}
                </span>
              )}
            </button>
          )}
        </nav>
      );
    };
  },
  {
    name: "MessageAnchorRail",
    inheritAttrs: false,
    props: [],
  },
);
