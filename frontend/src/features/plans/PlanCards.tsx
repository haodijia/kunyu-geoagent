import { useMemo } from "react";
import { FileText } from "lucide-react";
import type { ToolCall } from "@/features/agent/api";
import { useFilePreview } from "@/features/files/FilePreviewContext";
import { zhCN } from "@/locales/zh-CN";
import { submittedPlan } from "./plan";

export function PlanCards({ tools }: { readonly tools: readonly ToolCall[] }) {
  const preview = useFilePreview(),
    plans = useMemo(
      () => tools.map(submittedPlan).filter((plan) => plan !== null),
      [tools],
    );
  if (plans.length === 0) return null;
  return (
    <div
      className="my-2 flex w-full min-w-0 flex-col gap-2.5"
      data-plan-artifacts
    >
      {plans.map((plan) => (
        <button
          key={plan.tool_call_id}
          type="button"
          data-plan-card={plan.tool_call_id}
          aria-label={zhCN.planReview.openNamed(plan.title)}
          className="flex h-[60px] w-full min-w-0 items-center gap-2.5 rounded-[18px] border border-border bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2"
          onClick={() => preview.openPlan(plan.tool_call_id, plan.title)}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-border">
            <FileText className="size-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] font-medium leading-5">
              {plan.title}
            </span>
            <span className="truncate text-[10px] leading-4 text-muted-foreground">
              {zhCN.planReview.document}
            </span>
          </span>
          <span className="shrink-0 rounded-[10px] border border-border bg-background px-2 py-1 text-xs leading-[18px]">
            {zhCN.planReview.view}
          </span>
        </button>
      ))}
    </div>
  );
}
