import { useAnalysisInvalidation } from "@/features/analysis/useAnalysis";
import { computed, defineComponent } from "vue";
export const AnalysisEventsBridge = defineComponent(
  (
    componentProps: {
      readonly sessionId: string;
      readonly workspaceId: string;
    },
    { slots: _slots },
  ) => {
    const sessionId = computed(() => componentProps.sessionId),
      workspaceId = computed(() => componentProps.workspaceId);
    useAnalysisInvalidation(
      () => sessionId.value,
      () => workspaceId.value,
    );
    return () => {
      return null;
    };
  },
  {
    name: "AnalysisEventsBridge",
    inheritAttrs: false,
    props: ["sessionId", "workspaceId"],
  },
);
