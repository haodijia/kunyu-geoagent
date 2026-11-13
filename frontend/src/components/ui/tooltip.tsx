import {
  TooltipProvider as Provider,
  TooltipArrow,
  TooltipContent,
  TooltipPortal,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";
import type { SetupContext, VNodeChild } from "vue";
export function TooltipProvider(
  _props: {
    children?: VNodeChild;
  },
  { slots }: SetupContext,
) {
  return <Provider delayDuration={300}>{slots.default?.()}</Provider>;
}
export function Tooltip(
  {
    label,
    visible = true,
    side = "right",
    delayMs = 300,
  }: {
    label: string;
    visible?: boolean;
    side?: "top" | "right" | "bottom" | "left";
    delayMs?: number;
    children?: VNodeChild;
  },
  { slots }: SetupContext,
) {
  if (!visible) return <>{slots.default?.()}</>;
  return (
    <TooltipRoot delayDuration={delayMs}>
      <TooltipTrigger asChild>{slots.default?.()}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side={side}
          sideOffset={12}
          class="z-[110] max-w-[min(24rem,calc(100vw-2rem))] rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium break-words text-background shadow-lg"
        >
          {label}
          <TooltipArrow class="fill-foreground" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  );
}
