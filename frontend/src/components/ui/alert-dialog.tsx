import { cn } from "@/lib/utils";
import {
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogCancel as Cancel,
  AlertDialogContent as Content,
  AlertDialogDescription as Description,
  AlertDialogTitle as Title,
  type AlertDialogContentProps,
  type AlertDialogDescriptionProps,
  type AlertDialogTitleProps,
} from "reka-ui";
import type { HTMLAttributes, SetupContext } from "vue";
export const AlertDialog = AlertDialogRoot;
export const AlertDialogCancel = Cancel;
type ClassProp = {
  class?: HTMLAttributes["class"];
};
export function AlertDialogContent(
  {
    class: className,
    ...props
  }: AlertDialogContentProps &
    ClassProp & {
      role?: string;
      onEscapeKeyDown?: (event: KeyboardEvent) => void;
    },
  { slots }: SetupContext,
) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-[100] bg-overlay" />
      <Content
        class={cn(
          "fixed top-1/2 left-1/2 z-[101] grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-[var(--mu-radius-lg)] border bg-[var(--dialog-fill-0)] p-6 text-foreground shadow-lg",
          className,
        )}
        {...props}
      >
        {slots.default?.()}
      </Content>
    </AlertDialogPortal>
  );
}
export function AlertDialogTitle(
  { class: className, ...props }: AlertDialogTitleProps & ClassProp,
  { slots }: SetupContext,
) {
  return (
    <Title class={cn("m-0 text-base font-semibold", className)} {...props}>
      {slots.default?.()}
    </Title>
  );
}
export function AlertDialogDescription(
  { class: className, ...props }: AlertDialogDescriptionProps & ClassProp,
  { slots }: SetupContext,
) {
  return (
    <Description
      class={cn(
        "m-0 text-[13px] leading-[22px] text-muted-foreground",
        className,
      )}
      {...props}
    >
      {slots.default?.()}
    </Description>
  );
}
