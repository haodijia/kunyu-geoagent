import { cn } from "@/lib/utils";
import { Check, Minus } from "lucide-vue-next";
import {
  CheckboxIndicator,
  CheckboxRoot,
  type CheckboxRootProps,
} from "reka-ui";
import type { HTMLAttributes } from "vue";
export function Checkbox({
  class: className,
  checked,
  ...props
}: CheckboxRootProps & {
  class?: HTMLAttributes["class"];
  onClick?: (event: MouseEvent) => void;
  checked?: boolean | "indeterminate";
  "onUpdate:modelValue"?: (value: boolean | "indeterminate") => void;
}) {
  return (
    <CheckboxRoot
      data-slot="checkbox"
      modelValue={checked}
      class={cn(
        "peer flex size-4 shrink-0 items-center justify-center rounded border border-input bg-background shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxIndicator>
        {checked === "indeterminate" ? (
          <Minus class="size-3.5" />
        ) : (
          <Check class="size-3.5" />
        )}
      </CheckboxIndicator>
    </CheckboxRoot>
  );
}
