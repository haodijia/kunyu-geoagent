import { AlertTriangle, LoaderCircle, RotateCw, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RunSnapshot } from "@/features/runs/api";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";

type InterruptionAction = "cancel" | "resume";

export function InterruptedRunCard({
  className,
  run,
  pendingAction,
  onResume,
  onCancel,
  error
}: {
  readonly className: string;
  readonly run: RunSnapshot;
  readonly pendingAction: InterruptionAction | undefined;
  readonly onResume: () => void;
  readonly onCancel: () => void;
  readonly error: string | null;
}) {
  const content = zhCN.conversation.interruption;
  const description = run.state === "ready"
    ? content.readyDescription
    : run.resume_phase === "tool"
      ? content.toolDescription
      : content.modelDescription;
  return (
    <aside className={cn(className, "px-4 py-3.5")} aria-labelledby={`interrupted-${run.id}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
          <AlertTriangle className="size-4.5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-52 flex-1">
          <h3 id={`interrupted-${run.id}`} className="m-0 font-semibold text-foreground">
            {run.state === "ready" ? content.readyTitle : content.title}
          </h3>
          <p className="mt-1 mb-0 leading-5 text-muted-foreground">{description}</p>
          <p className="mt-1 mb-0 text-xs leading-5 text-muted-foreground">
            {content.snapshot(run.model_snapshot.model_id, run.attempt)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" disabled={pendingAction !== undefined} onClick={onCancel}>
            {pendingAction === "cancel" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Square className="size-3" aria-hidden="true" />}
            {pendingAction === "cancel" ? content.cancelling : content.cancel}
          </Button>
          <Button size="sm" disabled={pendingAction !== undefined} onClick={onResume}>
            {pendingAction === "resume" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <RotateCw className="size-3.5" aria-hidden="true" />}
            {pendingAction === "resume" ? content.resuming : content.resume}
          </Button>
        </div>
      </div>
      {error !== null ? <p className="mt-2 mb-0 text-xs text-destructive" role="alert">{error}</p> : null}
    </aside>
  );
}
