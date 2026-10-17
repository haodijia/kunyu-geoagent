import { Button } from "@/components/ui/button";
import { useSubagents } from "@/features/subagents/SubagentContext";
import { zhCN } from "@/locales/zh-CN";

export function SubagentRecordLink({ childId }: { readonly childId: string }) {
  const state = useSubagents();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => state.open(childId)}
    >
      {zhCN.subagents.open}
    </Button>
  );
}
