import { useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";

export function OverviewDialog({
  title,
  children,
  onClose,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="overview-dialog m-auto flex-col overflow-hidden rounded-2xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/35 backdrop:backdrop-blur-sm"
    >
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/70 px-5 py-3">
        <h2 className="truncate text-sm font-medium">{title}</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={copy.close}
        >
          <X className="size-4" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {children}
      </div>
    </dialog>
  );
}
