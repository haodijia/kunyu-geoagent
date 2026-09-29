import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  approveConfirmation,
  confirmationQueryKeys,
  rejectConfirmation
} from "@/features/confirmations/api";
import { messageQueryKeys } from "@/features/messages/api";
import { useSessionMessages } from "@/features/messages/SessionMessagesContext";
import { cancelRun, resumeRun, runQueryKeys } from "@/features/runs/api";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";

type RunAction = "approve" | "reject" | "cancel" | "resume";

export function RunControls() {
  const session = useSessionWorkspace();
  const queryClient = useQueryClient();
  const { runsQuery, confirmationsQuery } = useSessionMessages();
  const run = runsQuery.data?.find((item) =>
    !["completed", "failed", "cancelled"].includes(item.state)
  );
  const confirmation = run?.pending_confirmation_id === null || run === undefined
    ? undefined
    : confirmationsQuery.data?.find(
        (item) => item.id === run.pending_confirmation_id
      );
  const mutation = useMutation({
    mutationFn: async (action: RunAction) => {
      if (run === undefined) throw new Error("An active run is required.");
      if (action === "cancel") return cancelRun(run.id);
      if (action === "resume") return resumeRun(run.id);
      if (confirmation === undefined) {
        throw new Error("A pending confirmation is required.");
      }
      return action === "approve"
        ? approveConfirmation(confirmation.id)
        : rejectConfirmation(confirmation.id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: runQueryKeys.session(session.id) }),
        queryClient.invalidateQueries({
          queryKey: confirmationQueryKeys.session(session.id)
        }),
        queryClient.invalidateQueries({
          queryKey: messageQueryKeys.session(session.id)
        })
      ]);
    },
    onError: (error) => {
      console.error("[runs] Run action failed.", { runId: run?.id, error });
    }
  });

  if (run === undefined) return null;

  return (
    <aside className="mx-auto mb-2 w-[calc(100%-3rem)] max-w-[880px] rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
      {confirmation !== undefined ? (
        <div className="space-y-2">
          <p className="font-medium text-foreground">{confirmation.summary}</p>
          <p className="text-xs text-muted-foreground">
            {zhCN.conversation.confirmationScope}: {confirmation.workspace_id}
          </p>
          <pre className="max-h-36 overflow-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap text-foreground">
            {JSON.stringify(confirmation.arguments, null, 2)}
          </pre>
          <p className="text-xs text-muted-foreground">
            {zhCN.conversation.confirmationEffect}: {confirmation.side_effect}
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate("reject")}>
              {zhCN.conversation.reject}
            </Button>
            <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate("approve")}>
              {zhCN.conversation.approve}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="min-w-0 text-muted-foreground">
            {run.state === "interrupted"
              ? run.pause_reason ?? zhCN.conversation.interruptedRun
              : zhCN.conversation.activeRun}
          </p>
          <div className="flex shrink-0 gap-2">
            {run.state === "interrupted" ||
            (run.state === "ready" && run.requires_resume) ? (
              <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate("resume")}>
                {zhCN.conversation.resume}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate("cancel")}>
              {zhCN.conversation.stop}
            </Button>
          </div>
        </div>
      )}
      {mutation.isError ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {zhCN.conversation.runActionFailed}
        </p>
      ) : null}
    </aside>
  );
}
