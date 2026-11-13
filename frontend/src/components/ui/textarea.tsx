import { cn } from "@/lib/utils";
import type { SetupContext, TextareaHTMLAttributes } from "vue";
export function Textarea(
  { class: className, ...props }: TextareaHTMLAttributes,
  _context: SetupContext,
) {
  return (
    <textarea
      data-slot="textarea"
      class={cn(
        "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
