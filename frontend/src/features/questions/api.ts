import { requestJson } from "@/api/client";
import type { AgentTurn } from "@/features/agent/api";

export interface QuestionItem {
  readonly id: string;
  readonly question: string;
  readonly header: string | null;
  readonly detail: string | null;
  readonly options: readonly {
    readonly label: string;
    readonly description: string | null;
  }[];
  readonly multi_select: boolean;
  readonly intent: {
    readonly kind: "plan-review";
    readonly approve: string;
    readonly call_id: string | null;
  } | null;
}
export interface QuestionAnswer {
  readonly id: string;
  readonly selected: readonly string[];
  readonly custom?: string | null;
}
export interface HumanQuestion {
  readonly id: string;
  readonly session_id: string;
  readonly run_id: string;
  readonly tool_call_id: string;
  readonly questions: readonly QuestionItem[];
  readonly status: "pending" | "answered" | "dismissed" | "cancelled";
  readonly answer: { readonly answers: readonly QuestionAnswer[] } | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly updated_sequence: number;
}
export interface QuestionDecision {
  readonly question: HumanQuestion;
  readonly turn: AgentTurn;
  readonly continuation_required: boolean;
}
export const questionQueryKeys = {
  session: (id: string) => ["sessions", id, "questions"] as const,
};
export const listQuestions = (id: string) =>
  requestJson<HumanQuestion[]>(
    `/api/v1/sessions/${encodeURIComponent(id)}/questions`,
  );
export const decideQuestion = (
  id: string,
  answers: readonly QuestionAnswer[] | null,
) =>
  requestJson<QuestionDecision>(
    `/api/v1/questions/${encodeURIComponent(id)}/${answers === null ? "dismiss" : "answer"}`,
    {
      method: "POST",
      body: JSON.stringify(answers === null ? {} : { answers }),
    },
  );
export function mergeQuestions(
  current: readonly HumanQuestion[] | undefined,
  incoming: readonly HumanQuestion[],
): HumanQuestion[] {
  const map = new Map(current?.map((q) => [q.id, q]));
  for (const q of incoming) {
    const previous = map.get(q.id);
    if (
      previous === undefined ||
      q.updated_sequence >= previous.updated_sequence
    )
      map.set(q.id, q);
  }
  return [...map.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}
