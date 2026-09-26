import { LayoutDashboard } from "lucide-react";

import { SessionEmptyState } from "@/features/sessions/SessionEmptyState";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.sessionWorkspace;

export function OverviewView() {
  const session = useSessionWorkspace();

  return (
    <SessionEmptyState
      description={content.overviewEmptyDescription}
      icon={LayoutDashboard}
      title={session.title}
    />
  );
}
