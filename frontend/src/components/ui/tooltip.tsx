import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { PropsWithChildren, ReactElement } from "react";

interface TooltipProps {
  readonly children: ReactElement;
  readonly label: string;
  readonly visible?: boolean;
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly delayMs?: number;
}

export function TooltipProvider({ children }: PropsWithChildren) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({
  children,
  label,
  visible = true,
  side = "right",
  delayMs = 300
}: TooltipProps) {
  if (!visible) {
    return children;
  }

  return (
    <TooltipPrimitive.Root delayDuration={delayMs}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={12}
          className="z-[110] max-w-[min(24rem,calc(100vw-2rem))] rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium break-words text-background shadow-lg"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-foreground" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
