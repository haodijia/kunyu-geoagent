import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";

interface ActionMenuProps {
  readonly label: string;
  readonly action: string;
  readonly icon: ReactNode;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  readonly onSelect: () => void;
}

export function ActionMenu({
  label,
  action,
  icon,
  disabled,
  destructive,
  onSelect
}: ActionMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-slate-500 opacity-0 hover:bg-slate-200 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 disabled:opacity-40"
        >
          <Ellipsis className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          <DropdownMenu.Item
            onSelect={onSelect}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none focus:bg-slate-100 ${destructive ? "text-red-600" : "text-slate-700"}`}
          >
            {icon}
            {action}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
