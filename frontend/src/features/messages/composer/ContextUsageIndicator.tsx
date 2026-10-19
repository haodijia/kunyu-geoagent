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
import { useEffect, useRef, useState } from "react";

interface ContextUsageIndicatorProps {
  readonly value: ContextUsage | null;
}

/** Neutral usage ring, with a hover/focus panel and click-pinned details. */
export function ContextUsageIndicator({ value }: ContextUsageIndicatorProps) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  function clearClose() {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  function reveal() {
    clearClose();
    setOpen(true);
  }
  function leave() {
    clearClose();
    if (
      !pinned.current &&
      document.activeElement !== trigger.current &&
      !panel.current?.contains(document.activeElement)
    )
      closeTimer.current = setTimeout(() => setOpen(false), 160);
  }
  useEffect(
    () => () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    },
    [],
  );
  if (value === null) return null;
  const { usage, contextWindow, contextTokens } = value;
  const content = zhCN.conversation.contextUsage;
  const ratio =
    contextWindow === null
      ? null
      : contextTokens / contextWindow;
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
      open={open}
      onOpenChange={(next) => {
        clearClose();
        pinned.current = next;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          className="relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-context-usage
          data-usage-tokens={contextTokens}
          data-usage-estimated={value.estimated}
          data-context-window={contextWindow}
          data-request-sequence={value.requestSequence}
          aria-label={`${content.label} · ${main}`}
          title={main}
          onPointerEnter={reveal}
          onPointerLeave={leave}
          onFocus={reveal}
          onBlur={(event) => {
            if (!panel.current?.contains(event.relatedTarget)) leave();
          }}
          onClick={(event) => {
            event.preventDefault();
            clearClose();
            pinned.current = !pinned.current;
            setOpen(pinned.current);
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 26 26"
            className="-rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="13"
              cy="13"
              r="10.5"
              fill="none"
              stroke="var(--bg-4)"
              strokeWidth="1.5"
            />
            {ratio !== null && (
              <circle
                data-usage-progress
                cx="13"
                cy="13"
                r="10.5"
                fill="none"
                stroke={stroke}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - Math.min(1, ratio))}
                className="transition-[stroke-dashoffset,stroke] duration-300 motion-reduce:transition-none"
              />
            )}
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={panel}
        side="top"
        align="end"
        className="w-auto min-w-40 max-w-[min(22rem,calc(100vw-1rem))] p-2"
        aria-label={`${content.label} · ${main}`}
        title={main}
        onPointerEnter={reveal}
        onPointerLeave={leave}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <p className="text-sm font-medium text-foreground">{main}</p>
        {value.estimated && (
          <p className="mt-1 text-xs text-muted-foreground">{content.estimated}</p>
        )}
        {contextWindow == null && (
          <p className="mt-1 text-xs text-muted-foreground">
            {content.windowUnknown}
          </p>
        )}
        {breakdown !== "" && (
          <p className="mt-1 text-xs text-muted-foreground">{content.reported} · {breakdown}</p>
        )}
        <p className="mt-1 text-xs break-words text-muted-foreground">
          {content.model} · {providerName[value.providerType]} /{" "}
          {value.modelId}
        </p>
        {value.compaction?.outcome === "running" && (
          <p role="status" className="mt-1 text-xs text-muted-foreground">
            {content.compactionRunning}
          </p>
        )}
        {value.historyCompacted && (
          <p className="mt-1 text-xs text-muted-foreground">
            {content.compacted}
          </p>
        )}
        {value.compaction !== null &&
          !["running", "completed"].includes(value.compaction.outcome) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {content.compactionFailed}
            </p>
          )}
      </PopoverContent>
    </Popover>
  );
}
