import { Button } from "@/components/ui/button";
import { useSubagents } from "@/features/subagents/SubagentContext";
import { zhCN } from "@/locales/zh-CN";
import { computed, defineComponent } from "vue";
export const SubagentRecordLink = defineComponent(
  (
    componentProps: {
      readonly childId: string;
    },
    { slots: _slots },
  ) => {
    const childId = computed(() => componentProps.childId);
    const state = useSubagents();
    return () => {
      const _childId = childId.value;
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => state.open(_childId)}
        >
          {zhCN.subagents.open}
        </Button>
      );
    };
  },
  {
    name: "SubagentRecordLink",
    inheritAttrs: false,
    props: ["childId"],
  },
);
