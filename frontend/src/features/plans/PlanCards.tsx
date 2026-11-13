import type { ToolCall } from "@/features/agent/api";
import { submittedPlan } from "@/features/plans/plan";
import { usePlanDocument } from "@/features/plans/PlanDocument";
import { zhCN } from "@/locales/zh-CN";
import { FileText } from "lucide-vue-next";
import { computed, defineComponent } from "vue";
export const PlanCards = defineComponent(
  (
    componentProps: {
      readonly tools: readonly ToolCall[];
    },
    { slots: _slots },
  ) => {
    const tools = computed(() => componentProps.tools);
    const preview = usePlanDocument(),
      plans = computed(() =>
        tools.value.map(submittedPlan).filter((plan) => plan !== null),
      );
    return () => {
      const _plans = plans.value;
      if (_plans.length === 0) return null;
      return (
        <div
          class="my-2 flex w-full min-w-0 flex-col gap-2.5"
          data-plan-artifacts
        >
          {_plans.map((plan) => (
            <button
              key={plan.tool_call_id}
              type="button"
              data-plan-card={plan.tool_call_id}
              aria-label={zhCN.planReview.openNamed(plan.title)}
              class="flex h-[60px] w-full min-w-0 items-center gap-2.5 rounded-[18px] border border-border bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2"
              onClick={() => preview.openPlan(plan.tool_call_id, plan.title)}
            >
              <span class="grid size-10 shrink-0 place-items-center rounded-[10px] border border-border">
                <FileText class="size-5" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="truncate text-[13px] font-medium leading-5">
                  {plan.title}
                </span>
                <span class="truncate text-[10px] leading-4 text-muted-foreground">
                  {zhCN.planReview.document}
                </span>
              </span>
              <span class="shrink-0 rounded-[10px] border border-border bg-background px-2 py-1 text-xs leading-[18px]">
                {zhCN.planReview.view}
              </span>
            </button>
          ))}
        </div>
      );
    };
  },
  {
    name: "PlanCards",
    inheritAttrs: false,
    props: ["tools"],
  },
);
