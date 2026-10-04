import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/api/client";
import {
  agentQueryKeys,
  mergeAgentTurns,
  type AgentTurn,
} from "@/features/agent/api";
import { messageQueryKeys } from "@/features/messages/api";
import { useSessionMessages } from "@/features/messages/SessionMessagesContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import {
  decideQuestion,
  mergeQuestions,
  questionQueryKeys,
  type HumanQuestion,
  type QuestionAnswer,
} from "./api";
import { QuestionFlow } from "./QuestionFlow";

export function QuestionComposer({
  turn,
  onCancel,
  cancelPending,
  cancelError,
}: {
  readonly turn: AgentTurn;
  readonly onCancel: () => void;
  readonly cancelPending: boolean;
  readonly cancelError: string | null;
}) {
  const session = useSessionWorkspace(),
    client = useQueryClient();
  const { questionsQuery } = useSessionMessages();
  const question = questionsQuery.data?.find(
    (item) => item.run_id === turn.id && item.status === "pending",
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
  const mutation = useMutation({
    mutationFn: (answers: readonly QuestionAnswer[] | null) => {
      if (question === undefined)
        throw new Error("A pending question is required.");
      return decideQuestion(question.id, answers);
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
        id: question?.id,
        error,
      });
      void refresh();
    },
  });
  const error = mutation.isError
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : zhCN.questions.submitFailed
    : null;
  return (
    <div className="shrink-0 px-3 pt-2 pb-3">
      {question === undefined ? (
        <div
          className="chat-surface-fluid rounded-[20px] border border-border bg-background p-4 text-sm"
          role="status"
        >
          <p>
            {questionsQuery.isPending || questionsQuery.isFetching
              ? zhCN.questions.loading
              : zhCN.questions.loadFailed}
          </p>
          {cancelError !== null && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {cancelError}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={questionsQuery.isFetching}
              onClick={() => void questionsQuery.refetch()}
            >
              {zhCN.questions.retry}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={cancelPending}
              onClick={onCancel}
            >
              {zhCN.questions.cancelRun}
            </Button>
          </div>
        </div>
      ) : (
        <QuestionFlow
          key={question.id}
          question={question}
          busy={mutation.isPending || cancelPending}
          error={error}
          onResetError={mutation.reset}
          onDecide={async (answers) => {
            try {
              await mutation.mutateAsync(answers);
              return true;
            } catch {
              return false;
            }
          }}
        />
      )}
    </div>
  );
}
