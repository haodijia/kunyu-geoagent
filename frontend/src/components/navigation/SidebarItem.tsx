import type { ReactNode } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarItemProps {
  readonly collapsed: boolean;
  readonly disabled?: boolean;
  readonly framedIcon?: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly pending?: boolean;
  readonly onClick?: () => void;
}

export function SidebarItem({
  collapsed,
  disabled = false,
  framedIcon = false,
  icon,
  label,
  pending = false,
  onClick
}: SidebarItemProps) {
  return (
    <Tooltip label={label} visible={collapsed}>
      <button
        type="button"
        className={cn(
          "flex h-[34px] w-full items-center rounded-lg border-0 bg-transparent text-sm font-medium text-slate-700 outline-none transition-colors hover:bg-slate-100 active:bg-slate-200 focus-visible:ring-2 focus-visible:ring-ring/50 aria-disabled:cursor-default aria-disabled:hover:bg-transparent aria-disabled:active:bg-transparent disabled:pointer-events-none",
          collapsed ? "justify-center" : "gap-2 px-2.5"
        )}
        onClick={disabled ? undefined : onClick}
        disabled={pending}
        aria-disabled={disabled || undefined}
        aria-label={collapsed ? label : undefined}
        aria-busy={pending || undefined}
      >
        <span
          className={cn(
            "flex size-[22px] shrink-0 items-center justify-center text-slate-700",
            framedIcon &&
              "rounded-md border border-slate-200 bg-slate-50 transition-colors"
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
        {collapsed ? null : <span className="whitespace-nowrap">{label}</span>}
      </button>
    </Tooltip>
  );
}
