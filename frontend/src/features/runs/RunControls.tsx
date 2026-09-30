import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/api/client";
import {
  ConfirmationCard,
  ConfirmationUnavailable
} from "@/features/confirmations/ConfirmationCard";
import {
  approveConfirmation,
  confirmationQueryKeys,
  mergeConfirmationSnapshots,
  rejectConfirmation,
  type Confirmation,
  type ConfirmationDecision
} from "@/features/confirmations/api";
import { messageQueryKeys } from "@/features/messages/api";
import { useSessionMessages } from "@/features/messages/SessionMessagesContext";
import { InterruptedRunCard } from "@/features/runs/InterruptedRunCard";
import {
  cancelRun,
  mergeRunSnapshots,
  resumeRun,
  runQueryKeys,
  type RunSnapshot
} from "@/features/runs/api";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";

type RunAction = "approve" | "reject" | "cancel" | "resume";

interface RunActionResult {
  readonly run: RunSnapshot;
  readonly confirmation?: Confirmation;
}

export function RunControls({ embedded = false }: { readonly embedded?: boolean }) {
  const session = useSessionWorkspace();
  const queryClient = useQueryClient();
  const { runsQuery, confirmationsQuery } = useSessionMessages();
  const run = runsQuery.data?.find((item) =>
    !["completed", "failed", "cancelled"].includes(item.state)
  );
  const confirmation = run?.pending_confirmation_id === null || run === undefined
    ? undefined
    : confirmationsQuery.data?.find(
        (item) => item.id === run.pending_confirmation_id && item.status === "pending"
      );
  const mutation = useMutation({
    mutationFn: async (action: RunAction): Promise<RunActionResult> => {
      if (run === undefined) throw new Error("An active run is required.");
      if (action === "cancel") return { run: await cancelRun(session.id) };
      if (action === "resume") return { run: await resumeRun(session.id) };
      if (confirmation === undefined) {
        throw new Error("A pending confirmation is required.");
      }
      const decision: ConfirmationDecision = action === "approve"
        ? await approveConfirmation(confirmation.id)
        : await rejectConfirmation(confirmation.id);
      return { run: decision.run, confirmation: decision.confirmation };
    },
    onSuccess: ({ run: updatedRun, confirmation: updatedConfirmation }) => {
      queryClient.setQueryData<RunSnapshot[]>(
        runQueryKeys.session(session.id),
        (current) => mergeRunSnapshots(current, [updatedRun])
      );
      if (updatedConfirmation !== undefined) {
        queryClient.setQueryData<Confirmation[]>(
          confirmationQueryKeys.session(session.id),
          (current) => mergeConfirmationSnapshots(current, [updatedConfirmation])
        );
      }
      void refreshAgentState();
    },
    onError: (error) => {
      console.error("[runs] Run action failed.", { runId: run?.id, error });
      void refreshAgentState();
    }
  });

  function refreshAgentState() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: runQueryKeys.session(session.id) }),
      queryClient.invalidateQueries({ queryKey: confirmationQueryKeys.session(session.id) }),
      queryClient.invalidateQueries({ queryKey: messageQueryKeys.session(session.id) })
    ]);
  }

  if (run === undefined) return null;

  const className = cn(
    "rounded-xl border border-border bg-background text-sm shadow-sm",
    embedded ? "mt-3 w-full" : "mx-auto mb-2 w-[calc(100%-3rem)] max-w-[880px]"
  );
  const error = mutation.isError ? runActionError(mutation.error) : null;

  if (run.state === "waiting_confirmation") {
    if (confirmation === undefined) {
      return (
        <ConfirmationUnavailable
          className={className}
          loading={confirmationsQuery.isPending || confirmationsQuery.isFetching}
          pending={mutation.isPending}
          error={error}
          onCancel={() => mutation.mutate("cancel")}
          onRetry={() => void confirmationsQuery.refetch()}
        />
      );
    }
    return (
      <ConfirmationCard
        className={className}
        confirmation={confirmation}
        pendingAction={mutation.isPending && isConfirmationAction(mutation.variables)
          ? mutation.variables
          : undefined}
        onApprove={() => mutation.mutate("approve")}
        onReject={() => mutation.mutate("reject")}
        error={error}
      />
    );
  }

  if (
    run.state !== "interrupted" &&
    !(run.state === "ready" && run.requires_resume)
  ) {
    return null;
  }

  return (
    <InterruptedRunCard
      className={className}
      run={run}
      pendingAction={mutation.isPending && isInterruptionAction(mutation.variables)
        ? mutation.variables
        : undefined}
      onResume={() => mutation.mutate("resume")}
      onCancel={() => mutation.mutate("cancel")}
      error={error}
    />
  );
}

function isConfirmationAction(action: RunAction | undefined): action is "approve" | "reject" {
  return action === "approve" || action === "reject";
}

function isInterruptionAction(action: RunAction | undefined): action is "cancel" | "resume" {
  return action === "cancel" || action === "resume";
}

function runActionError(error: unknown): string {
  const content = zhCN.conversation.runActionErrors;
  if (!(error instanceof ApiError) || error.code === null) return content.unknown;
  return content.byCode[error.code as keyof typeof content.byCode] ?? content.unknown;
}
