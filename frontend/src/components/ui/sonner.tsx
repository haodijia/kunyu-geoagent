import {
  CircleCheck,
  CircleX,
  Info,
  LoaderCircle,
  TriangleAlert
} from "lucide-react";
import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      icons={{
        success: <CircleCheck className="size-4 text-success" />,
        error: <CircleX className="size-4 text-destructive" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4 text-warning" />,
        loading: <LoaderCircle className="size-4 animate-spin" />
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)"
        } as CSSProperties
      }
    />
  );
}
