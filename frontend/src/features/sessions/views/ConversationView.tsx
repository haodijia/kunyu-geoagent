import { MessageCircle } from "lucide-react";

import { SessionEmptyState } from "@/features/sessions/SessionEmptyState";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.sessionWorkspace;

export function ConversationView() {
  return (
    <SessionEmptyState
      description={content.conversationEmptyDescription}
      icon={MessageCircle}
      title={content.conversationEmptyTitle}
    />
  );
}
