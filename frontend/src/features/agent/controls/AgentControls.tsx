import { ApiError } from "@/api/client";
import {
  agentQueryKeys,
  cancelAgent,
  mergeAgentTurns,
  resumeAgent,
  type AgentTurn,
} from "@/features/agent/api";
import { InterruptedTurnCard } from "@/features/agent/controls/InterruptedTurnCard";
import {
  ConfirmationCard,
  ConfirmationUnavailable,
} from "@/features/confirmations/ConfirmationCard";
import {
  approveConfirmation,
  confirmationQueryKeys,
  mergeConfirmationSnapshots,
  rejectConfirmation,
  type Confirmation,
  type ConfirmationDecision,
} from "@/features/confirmations/api";
import { messageQueryKeys } from "@/features/messages/api";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, defineComponent, reactive, toRefs } from "vue";
type TurnAction = "approve" | "reject" | "cancel" | "resume";
interface TurnActionResult {
  readonly turn: AgentTurn;
  readonly confirmation?: Confirmation;
}
export const AgentControls = defineComponent(
  (
    componentProps: {
      readonly embedded?: boolean;
    },
    { slots: _slots },
  ) => {
    const embedded = computed(() =>
      componentProps.embedded === undefined ? false : componentProps.embedded,
    );
    const session = useSessionWorkspace();
    const queryClient = useQueryClient();
    const { agentTurnsQuery, confirmationsQuery } =
      toRefs(useSessionMessages());
    const turn = computed(() =>
      agentTurnsQuery.value.data?.find(
        (item) => !["completed", "failed", "cancelled"].includes(item.state),
      ),
    );
    const confirmation = computed(() =>
      turn.value?.pending_confirmation_id === null || turn.value === undefined
        ? undefined
        : confirmationsQuery.value.data?.find(
            (item) =>
              item.id === turn.value?.pending_confirmation_id &&
              item.status === "pending",
          ),
    );
    const mutation = reactive(
      useMutation({
        mutationFn: async (action: TurnAction): Promise<TurnActionResult> => {
          if (turn.value === undefined)
            throw new Error("An active Agent turn is required.");
          if (action === "cancel")
            return {
              turn: await cancelAgent(session.id),
            };
          if (action === "resume")
            return {
              turn: await resumeAgent(session.id),
            };
          if (confirmation.value === undefined) {
            throw new Error("A pending confirmation is required.");
          }
          const decision: ConfirmationDecision =
            action === "approve"
              ? await approveConfirmation(confirmation.value.id)
              : await rejectConfirmation(confirmation.value.id);
          return {
            turn: decision.turn,
            confirmation: decision.confirmation,
          };
        },
        onSuccess: ({
          turn: updatedTurn,
          confirmation: updatedConfirmation,
        }) => {
          queryClient.setQueryData<AgentTurn[]>(
            agentQueryKeys.session(session.id),
            (current) => mergeAgentTurns(current, [updatedTurn]),
          );
          if (updatedConfirmation !== undefined) {
            queryClient.setQueryData<Confirmation[]>(
              confirmationQueryKeys.session(session.id),
              (current) =>
                mergeConfirmationSnapshots(current, [updatedConfirmation]),
            );
          }
          void refreshAgentState();
        },
        onError: (error) => {
          console.error("[agent] Turn action failed.", {
            turnId: turn.value?.id,
            error,
          });
          void refreshAgentState();
        },
      }),
    );
    function refreshAgentState() {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: agentQueryKeys.session(session.id),
        }),
        queryClient.invalidateQueries({
          queryKey: confirmationQueryKeys.session(session.id),
        }),
        queryClient.invalidateQueries({
          queryKey: messageQueryKeys.session(session.id),
        }),
      ]);
    }
    const className = computed(() =>
      cn(
        "rounded-xl border border-border bg-background text-sm shadow-sm",
        embedded.value
          ? "mt-3 w-full"
          : "mx-auto mb-2 w-[calc(100%-3rem)] max-w-[880px]",
      ),
    );
    const error = computed(() =>
      mutation.isError ? runActionError(mutation.error) : null,
    );
    return () => {
      const _turn = turn.value,
        _confirmation = confirmation.value,
        _className = className.value,
        _error = error.value;
      if (_turn === undefined) return null;
      if (_turn.state === "waiting_confirmation") {
        if (_confirmation === undefined) {
          return (
            <ConfirmationUnavailable
              class={_className}
              loading={
                confirmationsQuery.value.isPending ||
                confirmationsQuery.value.isFetching
              }
              pending={mutation.isPending}
              error={_error}
              onCancel={() => mutation.mutate("cancel")}
              onRetry={() => void confirmationsQuery.value.refetch()}
            />
          );
        }
        return (
          <ConfirmationCard
            class={_className}
            confirmation={_confirmation}
            pendingAction={
              mutation.isPending && isConfirmationAction(mutation.variables)
                ? mutation.variables
                : undefined
            }
            onApprove={() => mutation.mutate("approve")}
            onReject={() => mutation.mutate("reject")}
            error={_error}
          />
        );
      }
      if (
        _turn.state !== "interrupted" &&
        !(_turn.state === "ready" && _turn.requires_resume)
      ) {
        return null;
      }
      return (
        <InterruptedTurnCard
          class={_className}
          turn={_turn}
          pendingAction={
            mutation.isPending && isInterruptionAction(mutation.variables)
              ? mutation.variables
              : undefined
          }
          onResume={() => mutation.mutate("resume")}
          onCancel={() => mutation.mutate("cancel")}
          error={_error}
        />
      );
    };
  },
  {
    name: "AgentControls",
    inheritAttrs: false,
    props: ["embedded"],
  },
);
function isConfirmationAction(
  action: TurnAction | undefined,
): action is "approve" | "reject" {
  return action === "approve" || action === "reject";
}
function isInterruptionAction(
  action: TurnAction | undefined,
): action is "cancel" | "resume" {
  return action === "cancel" || action === "resume";
}
function runActionError(error: unknown): string {
  const content = zhCN.conversation.runActionErrors;
  if (!(error instanceof ApiError) || error.code === null)
    return content.unknown;
  return (
    content.byCode[error.code as keyof typeof content.byCode] ?? content.unknown
  );
}
