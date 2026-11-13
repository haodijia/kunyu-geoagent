import { cn } from "@/lib/utils";
import {
  DropdownMenuContent as Content,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuItem as Item,
  DropdownMenuTrigger as Trigger,
  type DropdownMenuContentProps,
  type DropdownMenuItemProps,
} from "reka-ui";
import type { HTMLAttributes, SetupContext } from "vue";
export const DropdownMenu = DropdownMenuRoot;
export const DropdownMenuTrigger = Trigger;
export function DropdownMenuContent(
  {
    class: className,
    sideOffset = 6,
    ...props
  }: DropdownMenuContentProps & {
    class?: HTMLAttributes["class"];
  },
  { slots }: SetupContext,
) {
  return (
    <DropdownMenuPortal>
      <Content
        sideOffset={sideOffset}
        class={cn(
          "z-[100] min-w-52 max-w-[calc(100vw-1rem)] rounded-[var(--mu-radius-md)] border bg-popover p-1 text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      >
        {slots.default?.()}
      </Content>
    </DropdownMenuPortal>
  );
}
export function DropdownMenuItem(
  {
    class: className,
    ...props
  }: DropdownMenuItemProps & {
    class?: HTMLAttributes["class"];
    onSelect?: (event: Event) => void;
  },
  { slots }: SetupContext,
) {
  return (
    <Item
      class={cn(
        "relative flex min-h-7 cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] leading-5 outline-none focus:bg-muted focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {slots.default?.()}
    </Item>
  );
}
