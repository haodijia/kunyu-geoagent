import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-[100] min-w-52 max-w-[calc(100vw-1rem)] rounded-[var(--mu-radius-md)] border bg-popover p-1 text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "relative flex min-h-7 cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] leading-5 outline-none focus:bg-muted focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}
