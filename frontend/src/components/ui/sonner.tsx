import { Toaster as Sonner } from "vue-sonner";
import "vue-sonner/style.css";
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      style={{
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
        "--border-radius": "var(--radius)",
      }}
    />
  );
}
