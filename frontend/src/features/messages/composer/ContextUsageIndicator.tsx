import { refSetter, watchMounted } from "@/lib/lifecycle";
import { computed, defineComponent, shallowRef } from "vue";
// Adapted from Mu (Apache-2.0).

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ContextUsage } from "@/features/messages/composer/context-usage";
import { providerName } from "@/features/settings/models/provider-copy";
import { formatTokenCount, formatUsagePercentage } from "@/lib/token-format";
import { zhCN } from "@/locales/zh-CN";
interface ContextUsageIndicatorProps {
  readonly value: ContextUsage | null;
}

/** Neutral usage ring, with a hover/focus panel and click-pinned details. */
export const ContextUsageIndicator = defineComponent(
  (componentProps: ContextUsageIndicatorProps, { slots: _slots }) => {
    const value = computed(() => componentProps.value);
    const open = shallowRef(false),
      setOpen = refSetter(open);
    const pinned = shallowRef(false);
    const closeTimer = shallowRef<ReturnType<typeof setTimeout> | null>(null);
    const panel = shallowRef<HTMLDivElement | null>(null);
    const trigger = shallowRef<HTMLButtonElement | null>(null);
    function clearClose() {
      if (closeTimer.value !== null) {
        clearTimeout(closeTimer.value);
        closeTimer.value = null;
      }
    }
    function reveal() {
      clearClose();
      setOpen(true);
    }
    function leave() {
      clearClose();
      if (
        !pinned.value &&
        document.activeElement !== trigger.value &&
        !panel.value?.contains(document.activeElement)
      )
        closeTimer.value = setTimeout(() => setOpen(false), 160);
    }
    watchMounted([], () => () => {
      if (closeTimer.value !== null) clearTimeout(closeTimer.value);
    });
    return () => {
      const _value = value.value;
      if (_value === null) return null;
      const { usage, contextWindow, contextTokens } = _value;
      const content = zhCN.conversation.contextUsage;
      const ratio =
        contextWindow === null ? null : contextTokens / contextWindow;
      const main =
        contextWindow === null
          ? content.tokensUsed(formatTokenCount(contextTokens))
          : content.usedOfWindow(
              formatUsagePercentage(contextTokens / contextWindow),
              formatTokenCount(contextTokens),
              formatTokenCount(contextWindow, true),
            );
      const breakdown = [
        usage?.inputTokens == null
          ? null
          : content.input(formatTokenCount(usage.inputTokens)),
        usage?.outputTokens == null
          ? null
          : content.output(formatTokenCount(usage.outputTokens)),
        usage?.cacheReadTokens == null
          ? null
          : content.cacheRead(formatTokenCount(usage.cacheReadTokens)),
        usage?.cacheWriteTokens == null
          ? null
          : content.cacheWrite(formatTokenCount(usage.cacheWriteTokens)),
      ]
        .filter((part) => part !== null)
        .join(" · ");
      const circumference = 21 * Math.PI;
      const stroke =
        ratio !== null && ratio > 0.9
          ? "var(--danger)"
          : ratio !== null && ratio > 0.7
            ? "var(--warning)"
            : "var(--text-secondary)";

      return (
        <Popover
          open={open.value}
          onUpdate:open={(next) => {
            clearClose();
            pinned.value = next;
            setOpen(next);
          }}
        >
          <PopoverTrigger asChild>
            <button
              ref={trigger}
              type="button"
              class="relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-context-usage
              data-usage-tokens={contextTokens}
              data-usage-estimated={_value.estimated}
              data-context-window={contextWindow}
              data-request-sequence={_value.requestSequence}
              aria-label={`${content.label} · ${main}`}
              title={main}
              onPointerenter={reveal}
              onPointerleave={leave}
              onFocus={reveal}
              onBlur={(event) => {
                if (
                  !panel.value?.contains(
                    event.relatedTarget instanceof Node
                      ? event.relatedTarget
                      : null,
                  )
                )
                  leave();
              }}
              onClick={(event) => {
                event.preventDefault();
                clearClose();
                pinned.value = !pinned.value;
                setOpen(pinned.value);
              }}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 26 26"
                class="-rotate-90"
                aria-hidden="true"
              >
                <circle
                  cx="13"
                  cy="13"
                  r="10.5"
                  fill="none"
                  stroke="var(--bg-4)"
                  stroke-width="1.5"
                />
                {ratio !== null && (
                  <circle
                    data-usage-progress
                    cx="13"
                    cy="13"
                    r="10.5"
                    fill="none"
                    stroke={stroke}
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-dasharray={circumference}
                    stroke-dashoffset={circumference * (1 - Math.min(1, ratio))}
                    class="transition-[stroke-dashoffset,stroke] duration-300 motion-reduce:transition-none"
                  />
                )}
              </svg>
            </button>
          </PopoverTrigger>
          <PopoverContent
            elementRef={panel}
            side="top"
            align="end"
            class="w-auto min-w-40 max-w-[min(22rem,calc(100vw-1rem))] p-2"
            aria-label={`${content.label} · ${main}`}
            title={main}
            onPointerenter={reveal}
            onPointerleave={leave}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <p class="text-sm font-medium text-foreground">{main}</p>
            {_value.estimated && (
              <p class="mt-1 text-xs text-muted-foreground">
                {content.estimated}
              </p>
            )}
            {contextWindow == null && (
              <p class="mt-1 text-xs text-muted-foreground">
                {content.windowUnknown}
              </p>
            )}
            {breakdown !== "" && (
              <p class="mt-1 text-xs text-muted-foreground">
                {content.reported} · {breakdown}
              </p>
            )}
            <p class="mt-1 text-xs break-words text-muted-foreground">
              {content.model} · {providerName[_value.providerType]} /{" "}
              {_value.modelId}
            </p>
            {_value.compaction?.outcome === "running" && (
              <p role="status" class="mt-1 text-xs text-muted-foreground">
                {content.compactionRunning}
              </p>
            )}
            {_value.historyCompacted && (
              <p class="mt-1 text-xs text-muted-foreground">
                {content.compacted}
              </p>
            )}
            {_value.compaction !== null &&
              !["running", "completed"].includes(_value.compaction.outcome) && (
                <p class="mt-1 text-xs text-muted-foreground">
                  {content.compactionFailed}
                </p>
              )}
          </PopoverContent>
        </Popover>
      );
    };
  },
  {
    name: "ContextUsageIndicator",
    inheritAttrs: false,
    props: ["value"],
  },
);
