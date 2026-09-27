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
          "z-[100] min-w-52 max-w-[calc(100vw-1rem)] rounded-2xl border bg-popover p-1.5 text-popover-foreground shadow-lg",
          className
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
        "relative flex min-h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] leading-5 outline-none focus:bg-muted focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  );
}
