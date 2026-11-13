import { cn } from "@/lib/utils";
import {
  PopoverContent as Content,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger as Trigger,
  type PopoverContentProps,
} from "reka-ui";
import type { HTMLAttributes, Ref, SetupContext } from "vue";
export const Popover = PopoverRoot;
export const PopoverTrigger = Trigger;
export function PopoverContent(
  {
    class: className,
    sideOffset = 8,
    elementRef,
    ...props
  }: PopoverContentProps & {
    class?: HTMLAttributes["class"];
    elementRef?: Ref<HTMLDivElement | null>;
    ref?: Ref<HTMLDivElement | null>;
    title?: string;
    onPointerenter?: () => void;
    onPointerleave?: () => void;
    onEscapeKeyDown?: (event: KeyboardEvent) => void;
    onOpenAutoFocus?: (event: Event) => void;
    onCloseAutoFocus?: (event: Event) => void;
  },
  { slots }: SetupContext,
) {
  return (
    <PopoverPortal>
      <Content
        sideOffset={sideOffset}
        class={cn(
          "z-[100] max-w-[calc(100vw-1rem)] rounded-[var(--mu-radius-md)] border bg-popover p-3 text-popover-foreground shadow-md outline-none",
          className,
        )}
        {...props}
      >
        <div ref={elementRef}>{slots.default?.()}</div>
      </Content>
    </PopoverPortal>
  );
}
