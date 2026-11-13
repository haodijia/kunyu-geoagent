import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  agentQueryKeys,
  mergeAgentTurns,
  type AgentTurn,
} from "@/features/agent/api";
import { messageQueryKeys } from "@/features/messages/api";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { PlanReviewPanel } from "@/features/plans/PlanReviewPanel";
import { planReviewOf } from "@/features/plans/plan";
import { QuestionFlow } from "@/features/questions/QuestionFlow";
import {
  decideQuestion,
  mergeQuestions,
  questionQueryKeys,
  type HumanQuestion,
  type QuestionAnswer,
} from "@/features/questions/api";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, defineComponent, reactive, toRefs } from "vue";
export const QuestionComposer = defineComponent(
  (
    componentProps: {
      readonly turn: AgentTurn;
      readonly onCancel: () => void;
      readonly cancelPending: boolean;
      readonly cancelError: string | null;
    },
    { slots: _slots },
  ) => {
    const turn = computed(() => componentProps.turn),
      onCancel = computed(() => componentProps.onCancel),
      cancelPending = computed(() => componentProps.cancelPending),
      cancelError = computed(() => componentProps.cancelError);
    const session = useSessionWorkspace(),
      client = useQueryClient();
    const { questionsQuery } = toRefs(useSessionMessages());
    const question = computed(() =>
      questionsQuery.value.data?.find(
        (item) => item.run_id === turn.value.id && item.status === "pending",
      ),
    );
    async function refresh() {
      await Promise.all([
        client.invalidateQueries({
          queryKey: questionQueryKeys.session(session.id),
        }),
        client.invalidateQueries({
          queryKey: agentQueryKeys.session(session.id),
        }),
        client.invalidateQueries({
          queryKey: messageQueryKeys.session(session.id),
        }),
      ]);
    }
    const mutation = reactive(
      useMutation({
        mutationFn: (answers: readonly QuestionAnswer[] | null) => {
          if (question.value === undefined)
            throw new Error("A pending question is required.");
          return decideQuestion(question.value.id, answers);
        },
        onSuccess: (result) => {
          client.setQueryData<HumanQuestion[]>(
            questionQueryKeys.session(session.id),
            (current) => mergeQuestions(current, [result.question]),
          );
          client.setQueryData<AgentTurn[]>(
            agentQueryKeys.session(session.id),
            (current) => mergeAgentTurns(current, [result.turn]),
          );
          void refresh();
        },
        onError: (error) => {
          console.error("[questions] Failed to settle the human question.", {
            id: question.value?.id,
            error,
          });
          void refresh();
        },
      }),
    );
    const error = computed(() =>
      mutation.isError
        ? mutation.error instanceof ApiError
          ? mutation.error.message
          : zhCN.questions.submitFailed
        : null,
    );
    async function settle(answers: readonly QuestionAnswer[] | null) {
      try {
        await mutation.mutateAsync(answers);
        return true;
      } catch {
        return false;
      }
    }
    const review = computed(() =>
      question.value === undefined ? null : planReviewOf(question.value),
    );
    return () => {
      const _question = question.value,
        _review = review.value,
        _cancelPending = cancelPending.value,
        _error = error.value,
        _cancelError = cancelError.value,
        _onCancel = onCancel.value;
      if (_question !== undefined && _review !== null)
        return (
          <PlanReviewPanel
            pending={_question}
            review={_review}
            busy={mutation.isPending || _cancelPending}
            error={_error}
            onDecide={settle}
          />
        );
      return (
        <div class="shrink-0 px-3 pt-2 pb-3">
          {_question === undefined ? (
            <div
              class="chat-surface-fluid rounded-[20px] border border-border bg-background p-4 text-sm"
              role="status"
            >
              <p>
                {questionsQuery.value.isPending ||
                questionsQuery.value.isFetching
                  ? zhCN.questions.loading
                  : zhCN.questions.loadFailed}
              </p>
              {_cancelError !== null && (
                <p role="alert" class="mt-2 text-xs text-destructive">
                  {_cancelError}
                </p>
              )}
              <div class="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={questionsQuery.value.isFetching}
                  onClick={() => void questionsQuery.value.refetch()}
                >
                  {zhCN.questions.retry}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={_cancelPending}
                  onClick={_onCancel}
                >
                  {zhCN.questions.cancelRun}
                </Button>
              </div>
            </div>
          ) : (
            <QuestionFlow
              key={_question.id}
              question={_question}
              busy={mutation.isPending || _cancelPending}
              error={_error}
              onResetError={mutation.reset}
              onDecide={settle}
            />
          )}
        </div>
      );
    };
  },
  {
    name: "QuestionComposer",
    inheritAttrs: false,
    props: ["turn", "onCancel", "cancelPending", "cancelError"],
  },
);
