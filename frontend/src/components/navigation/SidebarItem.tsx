import type { ReactNode } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarItemProps {
  readonly collapsed: boolean;
  readonly disabled?: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly pending?: boolean;
  readonly onClick?: () => void;
}

export function SidebarItem({
  collapsed,
  disabled = false,
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
          "flex h-[34px] w-full items-center rounded-lg border-0 bg-transparent text-sm font-medium text-secondary-foreground outline-none transition-colors hover:bg-muted active:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 aria-disabled:cursor-default aria-disabled:hover:bg-transparent aria-disabled:active:bg-transparent disabled:pointer-events-none",
          collapsed ? "justify-center" : "gap-2 px-2.5"
        )}
        onClick={disabled ? undefined : onClick}
        disabled={pending}
        aria-disabled={disabled || undefined}
        aria-label={collapsed ? label : undefined}
        aria-busy={pending || undefined}
      >
        <span
          className="flex size-[22px] shrink-0 items-center justify-center text-secondary-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>
        {collapsed ? null : <span className="whitespace-nowrap">{label}</span>}
      </button>
    </Tooltip>
  );
}
