import { ConversationComposer } from "./ConversationComposer";
import { useSessionMessages } from "./SessionMessagesContext";
import { zhCN } from "@/locales/zh-CN";

interface SessionComposerProps {
  readonly compact?: boolean;
}

export function SessionComposer({ compact = false }: SessionComposerProps) {
  const { draft, changeDraft, sendMessage, messagesQuery, mutation } = useSessionMessages();
  if (messagesQuery.data === undefined) return null;
  return <ConversationComposer draft={draft} onDraftChange={changeDraft} onSubmit={sendMessage}
    compact={compact} pending={mutation.isPending}
    error={mutation.isError ? zhCN.conversation.sendFailed : null} />;
}
