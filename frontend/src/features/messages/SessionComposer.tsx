import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { ConversationComposer } from "./ConversationComposer";
import { useSessionMessages } from "./SessionMessagesContext";
import { zhCN } from "@/locales/zh-CN";

interface SessionComposerProps {
  readonly compact?: boolean;
}

export function SessionComposer({ compact = false }: SessionComposerProps) {
  const { draft, changeDraft, sendMessage, messagesQuery, mutation } = useSessionMessages();
  const session = useSessionWorkspace();
  if (session.archived) return <p className="px-6 py-3 text-sm text-slate-500">{zhCN.archivedSessions.readOnly}</p>;
  if (messagesQuery.data === undefined) return null;
  return <ConversationComposer draft={draft} onDraftChange={changeDraft} onSubmit={sendMessage}
    compact={compact} pending={mutation.isPending}
    error={mutation.isError ? zhCN.conversation.sendFailed : null} />;
}
