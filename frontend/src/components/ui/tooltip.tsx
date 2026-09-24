import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { PropsWithChildren, ReactElement } from "react";

interface TooltipProps {
  readonly children: ReactElement;
  readonly label: string;
  readonly visible?: boolean;
}

export function TooltipProvider({ children }: PropsWithChildren) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({ children, label, visible = true }: TooltipProps) {
  if (!visible) {
    return children;
  }

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="right"
          sideOffset={12}
          className="z-[100] rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-slate-950" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
