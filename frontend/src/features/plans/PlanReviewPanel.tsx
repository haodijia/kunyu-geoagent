import { ChevronRight, Circle, LoaderCircle, Pencil } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useFilePreview } from "@/features/files/FilePreviewContext";
import type {
  HumanQuestion,
  QuestionAnswer,
  QuestionItem,
} from "@/features/questions/api";
import { zhCN } from "@/locales/zh-CN";
import { planSummary } from "./plan";

const copy = zhCN.planReview;
export function PlanReviewPanel({
  pending,
  review,
  busy,
  error,
  onDecide,
}: {
  readonly pending: HumanQuestion;
  readonly review: QuestionItem;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onDecide: (
    answer: readonly QuestionAnswer[] | null,
  ) => Promise<boolean>;
}) {
  if (review.intent === null || review.detail === null)
    throw new Error("A complete plan review is required.");
  const preview = useFilePreview();
  const summary = useMemo(() => planSummary(review.detail!), [review.detail]);
  useEffect(() => {
    preview.openReview(pending.id, pending.tool_call_id, summary.title);
  }, [preview.openReview, pending.id, pending.tool_call_id, summary.title]);
  const approve = review.options.find(
    (option) => option.label === review.intent!.approve,
  )!;
  return (
    <div className="shrink-0 px-7 pt-1.5 pb-2.5">
      <section
        data-plan-review-key={pending.id}
        aria-label={review.question}
        aria-busy={busy}
        className="chat-surface-fluid overflow-hidden rounded-[20px] border border-[var(--mu-input-border)] bg-[var(--mu-composer-bg)] text-foreground max-[720px]:rounded-2xl"
      >
        <div className="flex shrink-0 items-center gap-2 bg-amber-500/10 px-4 py-3 text-sm leading-5 text-amber-800 dark:text-amber-300">
          {busy ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Circle className="size-2.5 fill-current" />
          )}
          <span>{copy.header}</span>
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 text-xs text-secondary-foreground hover:text-foreground focus-visible:outline-2"
            aria-label={copy.open}
            onClick={() =>
              preview.openPlan(pending.tool_call_id, summary.title)
            }
          >
            {copy.full}
            <ChevronRight className="size-3.5" />
          </button>
        </div>
        <div className="min-w-0 px-4 pt-3.5 pb-3">
          <h3 className="truncate text-[15px] font-medium leading-[22px]">
            {summary.title}
          </h3>
          {summary.description !== "" && (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-secondary-foreground">
              {summary.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-2 pb-3 max-[720px]:items-end max-[720px]:px-3 max-[720px]:pb-2.5">
          <p
            role="status"
            className="min-h-4 min-w-0 text-[11px] leading-4 text-destructive"
          >
            {error}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void onDecide(null)}
            >
              <Pencil className="size-3.5" />
              {copy.discuss}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              title={approve.description ?? undefined}
              onClick={() =>
                void onDecide([{ id: review.id, selected: [approve.label] }])
              }
            >
              {copy.approve}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
