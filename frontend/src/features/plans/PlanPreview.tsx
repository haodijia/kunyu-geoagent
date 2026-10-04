import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/api/client";
import { MessageMarkdown } from "@/features/messages/MessageMarkdown";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { getPlan, planQueryKeys } from "./api";
import { planSummary } from "./plan";

export function PlanPreview({ toolId }: { readonly toolId: string }) {
  const session = useSessionWorkspace();
  const query = useQuery({
    queryKey: planQueryKeys.document(session.id, toolId),
    queryFn: () => getPlan(session.id, toolId),
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    if (query.error !== null)
      console.error("[plans] Plan preview failed.", {
        sessionId: session.id,
        toolId,
        error: query.error,
      });
  }, [query.error, session.id, toolId]);
  if (query.isPending)
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        {zhCN.planReview.loading}
      </p>
    );
  if (query.isError)
    return (
      <div role="alert" className="p-6 text-sm text-destructive">
        <p>
          {query.error instanceof ApiError
            ? query.error.message
            : zhCN.planReview.loadFailed}
        </p>
        <Button
          className="mt-2"
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {zhCN.questions.retry}
        </Button>
      </div>
    );
  return (
    <section
      data-plan-preview={toolId}
      aria-label={planSummary(query.data.markdown).title}
      className="min-h-0 flex-1 overflow-auto px-6 pt-5 pb-10 max-[767px]:px-[18px] max-[767px]:pt-4 max-[767px]:pb-8"
    >
      <MessageMarkdown text={query.data.markdown} />
    </section>
  );
}
