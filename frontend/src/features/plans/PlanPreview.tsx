import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { MessageMarkdown } from "@/features/messages/rendering/MessageMarkdown";
import { getPlan, planQueryKeys } from "@/features/plans/api";
import { planSummary } from "@/features/plans/plan";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQuery } from "@tanstack/vue-query";
import { computed, defineComponent, reactive } from "vue";
export const PlanPreview = defineComponent(
  (
    componentProps: {
      readonly toolId: string;
    },
    { slots: _slots },
  ) => {
    const toolId = computed(() => componentProps.toolId);
    const session = useSessionWorkspace();
    const query = reactive(
      useQuery(
        computed(() => ({
          queryKey: planQueryKeys.document(session.id, toolId.value),
          queryFn: () => getPlan(session.id, toolId.value),
          staleTime: Infinity,
          retry: false,
        })),
      ),
    );
    watchMounted(
      [() => query.error, () => session.id, () => toolId.value],
      () => {
        if (query.error !== null)
          console.error("[plans] Plan preview failed.", {
            sessionId: session.id,
            toolId: toolId.value,
            error: query.error,
          });
      },
    );
    return () => {
      const _toolId = toolId.value;
      if (query.isPending)
        return (
          <p role="status" class="p-6 text-sm text-muted-foreground">
            {zhCN.planReview.loading}
          </p>
        );
      if (query.isError)
        return (
          <div role="alert" class="p-6 text-sm text-destructive">
            <p>
              {query.error instanceof ApiError
                ? query.error.message
                : zhCN.planReview.loadFailed}
            </p>
            <Button
              class="mt-2"
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
          data-plan-preview={_toolId}
          aria-label={planSummary(query.data.markdown).title}
          class="min-h-0 flex-1 overflow-auto px-6 pt-5 pb-10 max-[767px]:px-[18px] max-[767px]:pt-4 max-[767px]:pb-8"
        >
          <MessageMarkdown text={query.data.markdown} />
        </section>
      );
    };
  },
  {
    name: "PlanPreview",
    inheritAttrs: false,
    props: ["toolId"],
  },
);
