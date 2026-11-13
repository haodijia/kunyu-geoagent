import { Button } from "@/components/ui/button";
import { planSummary } from "@/features/plans/plan";
import { usePlanDocument } from "@/features/plans/PlanDocument";
import type {
  HumanQuestion,
  QuestionAnswer,
  QuestionItem,
} from "@/features/questions/api";
import { watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { ChevronRight, Circle, LoaderCircle, Pencil } from "lucide-vue-next";
import { computed, defineComponent } from "vue";
const copy = zhCN.planReview;
export const PlanReviewPanel = defineComponent(
  (
    componentProps: {
      readonly pending: HumanQuestion;
      readonly review: QuestionItem;
      readonly busy: boolean;
      readonly error: string | null;
      readonly onDecide: (
        answer: readonly QuestionAnswer[] | null,
      ) => Promise<boolean>;
    },
    { slots: _slots },
  ) => {
    const pending = computed(() => componentProps.pending),
      review = computed(() => componentProps.review),
      busy = computed(() => componentProps.busy),
      error = computed(() => componentProps.error),
      onDecide = computed(() => componentProps.onDecide);
    if (review.value.intent === null || review.value.detail === null)
      throw new Error("A complete plan review is required.");
    const preview = usePlanDocument();
    const summary = computed(() => planSummary(review.value.detail!));
    watchMounted(
      [
        () => preview.openReview,
        () => pending.value.id,
        () => pending.value.tool_call_id,
        () => summary.value.title,
      ],
      () => {
        preview.openReview(
          pending.value.id,
          pending.value.tool_call_id,
          summary.value.title,
        );
      },
    );
    const approve = computed(() =>
      review.value.options.find(
        (option) => option.label === review.value.intent!.approve,
      )!,
    );
    return () => {
      const _pending = pending.value,
        _review = review.value,
        _busy = busy.value,
        _summary = summary.value,
        _error = error.value,
        _onDecide = onDecide.value,
        _approve = approve.value;
      return (
        <div class="shrink-0 px-7 pt-1.5 pb-2.5">
          <section
            data-plan-review-key={_pending.id}
            aria-label={_review.question}
            aria-busy={_busy}
            class="chat-surface-fluid overflow-hidden rounded-[20px] border border-[var(--mu-input-border)] bg-[var(--mu-composer-bg)] text-foreground max-[720px]:rounded-2xl"
          >
            <div class="flex shrink-0 items-center gap-2 bg-amber-500/10 px-4 py-3 text-sm leading-5 text-amber-800 dark:text-amber-300">
              {_busy ? (
                <LoaderCircle class="size-3.5 animate-spin" />
              ) : (
                <Circle class="size-2.5 fill-current" />
              )}
              <span>{copy.header}</span>
              <button
                type="button"
                class="ml-auto inline-flex items-center gap-1 text-xs text-secondary-foreground hover:text-foreground focus-visible:outline-2"
                aria-label={copy.open}
                onClick={() =>
                  preview.openPlan(_pending.tool_call_id, _summary.title)
                }
              >
                {copy.full}
                <ChevronRight class="size-3.5" />
              </button>
            </div>
            <div class="min-w-0 px-4 pt-3.5 pb-3">
              <h3 class="truncate text-[15px] font-medium leading-[22px]">
                {_summary.title}
              </h3>
              {_summary.description !== "" && (
                <p class="mt-2 line-clamp-2 text-sm leading-6 text-secondary-foreground">
                  {_summary.description}
                </p>
              )}
            </div>
            <div class="flex shrink-0 items-center justify-between gap-3 px-4 pt-2 pb-3 max-[720px]:items-end max-[720px]:px-3 max-[720px]:pb-2.5">
              <p
                role="status"
                class="min-h-4 min-w-0 text-[11px] leading-4 text-destructive"
              >
                {_error}
              </p>
              <div class="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={_busy}
                  onClick={() => void _onDecide(null)}
                >
                  <Pencil class="size-3.5" />
                  {copy.discuss}
                </Button>
                <Button
                  size="sm"
                  disabled={_busy}
                  title={_approve.description ?? undefined}
                  onClick={() =>
                    void _onDecide([
                      {
                        id: _review.id,
                        selected: [_approve.label],
                      },
                    ])
                  }
                >
                  {copy.approve}
                </Button>
              </div>
            </div>
          </section>
        </div>
      );
    };
  },
  {
    name: "PlanReviewPanel",
    inheritAttrs: false,
    props: ["pending", "review", "busy", "error", "onDecide"],
  },
);
