import type { ReactNode } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarItemProps {
  readonly collapsed: boolean;
  readonly framedIcon?: boolean;
  readonly icon: ReactNode;
  readonly label: string;
}

export function SidebarItem({
  collapsed,
  framedIcon = false,
  icon,
  label
}: SidebarItemProps) {
  return (
    <Tooltip label={label} visible={collapsed}>
      <div
        className={cn(
          "flex h-[34px] items-center rounded-lg text-sm font-medium text-slate-700 outline-none transition-colors hover:bg-slate-100 active:bg-slate-200 focus-visible:ring-2 focus-visible:ring-ring/50",
          collapsed ? "justify-center" : "gap-2 px-2.5"
        )}
        aria-disabled="true"
        aria-label={collapsed ? label : undefined}
        tabIndex={collapsed ? 0 : undefined}
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
      </div>
    </Tooltip>
  );
}
