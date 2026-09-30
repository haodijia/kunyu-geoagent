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
import { InterruptedTurnCard } from "@/features/agent/InterruptedTurnCard";
import {
  cancelAgent,
  mergeAgentTurns,
  resumeAgent,
  agentQueryKeys,
  type AgentTurn
} from "@/features/agent/api";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";

type TurnAction = "approve" | "reject" | "cancel" | "resume";

interface TurnActionResult {
  readonly turn: AgentTurn;
  readonly confirmation?: Confirmation;
}

export function AgentControls({ embedded = false }: { readonly embedded?: boolean }) {
  const session = useSessionWorkspace();
  const queryClient = useQueryClient();
  const { agentTurnsQuery, confirmationsQuery } = useSessionMessages();
  const turn = agentTurnsQuery.data?.find((item) =>
    !["completed", "failed", "cancelled"].includes(item.state)
  );
  const confirmation = turn?.pending_confirmation_id === null || turn === undefined
    ? undefined
    : confirmationsQuery.data?.find(
        (item) => item.id === turn.pending_confirmation_id && item.status === "pending"
      );
  const mutation = useMutation({
    mutationFn: async (action: TurnAction): Promise<TurnActionResult> => {
      if (turn === undefined) throw new Error("An active Agent turn is required.");
      if (action === "cancel") return { turn: await cancelAgent(session.id) };
      if (action === "resume") return { turn: await resumeAgent(session.id) };
      if (confirmation === undefined) {
        throw new Error("A pending confirmation is required.");
      }
      const decision: ConfirmationDecision = action === "approve"
        ? await approveConfirmation(confirmation.id)
        : await rejectConfirmation(confirmation.id);
      return { turn: decision.turn, confirmation: decision.confirmation };
    },
    onSuccess: ({ turn: updatedTurn, confirmation: updatedConfirmation }) => {
      queryClient.setQueryData<AgentTurn[]>(
        agentQueryKeys.session(session.id),
        (current) => mergeAgentTurns(current, [updatedTurn])
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
      console.error("[agent] Turn action failed.", { turnId: turn?.id, error });
      void refreshAgentState();
    }
  });

  function refreshAgentState() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: agentQueryKeys.session(session.id) }),
      queryClient.invalidateQueries({ queryKey: confirmationQueryKeys.session(session.id) }),
      queryClient.invalidateQueries({ queryKey: messageQueryKeys.session(session.id) })
    ]);
  }

  if (turn === undefined) return null;

  const className = cn(
    "rounded-xl border border-border bg-background text-sm shadow-sm",
    embedded ? "mt-3 w-full" : "mx-auto mb-2 w-[calc(100%-3rem)] max-w-[880px]"
  );
  const error = mutation.isError ? runActionError(mutation.error) : null;

  if (turn.state === "waiting_confirmation") {
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
    turn.state !== "interrupted" &&
    !(turn.state === "ready" && turn.requires_resume)
  ) {
    return null;
  }

  return (
    <InterruptedTurnCard
      className={className}
      turn={turn}
      pendingAction={mutation.isPending && isInterruptionAction(mutation.variables)
        ? mutation.variables
        : undefined}
      onResume={() => mutation.mutate("resume")}
      onCancel={() => mutation.mutate("cancel")}
      error={error}
    />
  );
}

function isConfirmationAction(action: TurnAction | undefined): action is "approve" | "reject" {
  return action === "approve" || action === "reject";
}

function isInterruptionAction(action: TurnAction | undefined): action is "cancel" | "resume" {
  return action === "cancel" || action === "resume";
}

function runActionError(error: unknown): string {
  const content = zhCN.conversation.runActionErrors;
  if (!(error instanceof ApiError) || error.code === null) return content.unknown;
  return content.byCode[error.code as keyof typeof content.byCode] ?? content.unknown;
}
