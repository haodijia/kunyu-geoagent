import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, SetupContext } from "vue";
export function Input(
  { class: className, ...props }: InputHTMLAttributes,
  _context: SetupContext,
) {
  return (
    <input
      data-slot="input"
      class={cn(
        "h-9 min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
