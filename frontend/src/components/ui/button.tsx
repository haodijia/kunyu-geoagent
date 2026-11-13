import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Primitive } from "reka-ui";
import type { ButtonHTMLAttributes, SetupContext } from "vue";
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        icon: "size-10",
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs",
        "icon-sm": "size-7 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
export interface ButtonProps
  extends ButtonHTMLAttributes, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
export function Button(
  { class: className, asChild = false, variant, size, ...props }: ButtonProps,
  { slots }: SetupContext,
) {
  return (
    <Primitive
      as="button"
      asChild={asChild}
      {...props}
      class={cn(
        buttonVariants({
          variant,
          size,
        }),
        className,
      )}
    >
      {slots.default?.()}
    </Primitive>
  );
}
