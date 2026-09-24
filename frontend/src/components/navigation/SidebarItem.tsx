import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SidebarItemProps {
  readonly framedIcon?: boolean;
  readonly icon: ReactNode;
  readonly label: string;
}

export function SidebarItem({
  framedIcon = false,
  icon,
  label
}: SidebarItemProps) {
  return (
    <div
      className="flex h-[34px] items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-slate-700 outline-none transition-colors hover:bg-slate-100 active:bg-slate-200 focus-visible:ring-2 focus-visible:ring-ring/50"
      aria-disabled="true"
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
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );
}
