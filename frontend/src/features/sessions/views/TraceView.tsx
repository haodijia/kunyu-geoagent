import { ListTree } from "lucide-react";

import { SessionEmptyState } from "@/features/sessions/SessionEmptyState";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.sessionWorkspace;

export function TraceView() {
  return (
    <SessionEmptyState
      description={content.traceEmptyDescription}
      icon={ListTree}
      title={content.traceEmptyTitle}
    />
  );
}
