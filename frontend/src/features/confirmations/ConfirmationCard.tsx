import {
  AlertTriangle,
  Check,
  LoaderCircle,
  RotateCw,
  ShieldCheck,
  Square,
  X
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { Confirmation } from "@/features/confirmations/api";
import { toolLabel } from "@/features/runs/ToolActivity";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";

type ConfirmationAction = "approve" | "reject";

export function ConfirmationCard({
  className,
  confirmation,
  pendingAction,
  onApprove,
  onReject,
  error
}: {
  readonly className: string;
  readonly confirmation: Confirmation;
  readonly pendingAction: ConfirmationAction | undefined;
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly error: string | null;
}) {
  const content = zhCN.conversation.confirmation;
  return (
    <aside className={className} aria-labelledby={`confirmation-${confirmation.id}`}>
      <div className="flex items-start gap-3 border-b border-border px-4 py-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
          <ShieldCheck className="size-4.5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 id={`confirmation-${confirmation.id}`} className="m-0 font-semibold text-foreground">
            {content.title}
          </h3>
          <p className="mt-1 mb-0 leading-5 text-muted-foreground">
            {confirmation.summary}
          </p>
        </div>
      </div>
      <dl className="m-0 divide-y divide-border px-4">
        <ConfirmationRow label={content.operation}>
          <span>{toolLabel(confirmation.name)}</span>
          <code className="ml-2 text-xs text-muted-foreground">{confirmation.name}</code>
        </ConfirmationRow>
        <ConfirmationRow label={content.scope}>
          <span>{content.currentWorkspace}</span>
          <code className="ml-2 text-xs text-muted-foreground">{confirmation.workspace_id}</code>
        </ConfirmationRow>
        <ConfirmationRow label={content.parameters} vertical>
          <pre className="m-0 max-h-48 overflow-auto rounded-lg bg-muted px-3 py-2.5 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
            {JSON.stringify(confirmation.arguments, null, 2)}
          </pre>
        </ConfirmationRow>
        <ConfirmationRow label={content.sideEffect}>
          <span className="text-foreground">{confirmation.side_effect}</span>
        </ConfirmationRow>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="m-0 min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
          {content.exactSnapshot}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" disabled={pendingAction !== undefined} onClick={onReject}>
            {pendingAction === "reject" ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <X className="size-3.5" aria-hidden="true" />
            )}
            {pendingAction === "reject" ? content.rejecting : content.reject}
          </Button>
          <Button size="sm" disabled={pendingAction !== undefined} onClick={onApprove}>
            {pendingAction === "approve" ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-3.5" aria-hidden="true" />
            )}
            {pendingAction === "approve" ? content.approving : content.approve}
          </Button>
        </div>
        {error !== null ? (
          <p className="m-0 w-full text-xs text-destructive" role="alert">{error}</p>
        ) : null}
      </div>
    </aside>
  );
}

export function ConfirmationUnavailable({
  className,
  loading,
  pending,
  error,
  onCancel,
  onRetry
}: {
  readonly className: string;
  readonly loading: boolean;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
}) {
  const content = zhCN.conversation.confirmation;
  return (
    <aside className={cn(className, "flex flex-wrap items-start gap-3 px-4 py-3.5")}>
      {loading ? (
        <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      )}
      <div className="min-w-52 flex-1">
        <p className="m-0 font-medium text-foreground">
          {loading ? content.loading : content.loadFailed}
        </p>
        <p className="mt-1 mb-0 text-xs leading-5 text-muted-foreground">
          {content.loadFailedHelp}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {!loading ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={onRetry}>
            <RotateCw className="size-3.5" aria-hidden="true" />
            {content.retry}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" disabled={pending} onClick={onCancel}>
          {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Square className="size-3" aria-hidden="true" />}
          {pending ? content.cancelling : content.cancelRun}
        </Button>
      </div>
      {error !== null ? <p className="m-0 w-full text-xs text-destructive" role="alert">{error}</p> : null}
    </aside>
  );
}

function ConfirmationRow({
  children,
  label,
  vertical = false
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly vertical?: boolean;
}) {
  return (
    <div className={cn("grid gap-3 py-3", vertical ? "grid-cols-1" : "grid-cols-[7rem_1fr]")}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}
