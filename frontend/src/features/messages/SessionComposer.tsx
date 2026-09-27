import { ConversationComposer } from "./ConversationComposer";
import { useSessionMessages } from "./SessionMessagesContext";
import { zhCN } from "@/locales/zh-CN";

export function SessionComposer() {
  const { draft, changeDraft, sendMessage, messagesQuery, mutation } = useSessionMessages();
  if (messagesQuery.data === undefined) return null;
  return <ConversationComposer draft={draft} onDraftChange={changeDraft} onSubmit={sendMessage}
    pending={mutation.isPending} error={mutation.isError ? zhCN.conversation.sendFailed : null} />;
}
