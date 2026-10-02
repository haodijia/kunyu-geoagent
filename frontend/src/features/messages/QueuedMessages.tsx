import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CornerDownRight, Inbox, Pencil, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { discardAgentInput } from "@/features/agent/api";
import { pendingInboxMessages } from "@/features/conversation/inbox";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { messageQueryKeys, type SessionMessage } from "./api";
import { useSessionMessages } from "./SessionMessagesContext";

const content = zhCN.conversation.queue;

export function QueuedMessages() {
  const session = useSessionWorkspace();
  const { records } = useSessionEvents();
  const { messagesQuery, draft, changeDraft } = useSessionMessages();
  const queryClient = useQueryClient();
  const pending = useMemo(() => pendingInboxMessages(records, "next-turn"), [records]);
  const messages = (messagesQuery.data ?? []).filter((message) => pending.has(message.id));
  const mutation = useMutation({
    mutationFn: async (input: { messages: readonly SessionMessage[]; edit: boolean }) => {
      const editing = input.edit ? input.messages[0] : null;
      if (editing === undefined) throw new Error("Editing requires a queued message.");
      for (const message of input.messages) {
        await discardAgentInput(session.id, message.id);
      }
      return editing === null ? null : editing.content;
    },
    onSuccess: (text) => {
      if (text !== null) changeDraft(text);
    },
    onError: (error) => {
      console.error("[inbox] Failed to change queued input.", { sessionId: session.id, error });
      toast.error(content.failed);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: messageQueryKeys.session(session.id) }),
  });
  if (messages.length === 0) return null;
  return (
    <div className="shrink-0 px-3 pt-2">
    <section aria-label={content.title} className="chat-surface-fluid -mb-3 rounded-t-[18px] border border-border bg-muted/40 px-3 pt-2 pb-5">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><Inbox className="size-3.5" aria-hidden="true" />{content.title}<span className="rounded-full bg-muted px-1.5 text-[10px] leading-4">{messages.length}</span></span>
        <div className="flex items-center gap-2">
          <span>{content.auto}</span>
          <Button type="button" variant="ghost" className="h-6 px-1.5 text-[11px]" disabled={mutation.isPending} onClick={() => mutation.mutate({ messages, edit: false })}>{content.clear}</Button>
        </div>
      </div>
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {messages.map((message) => (
          <div key={message.id} className="flex items-center gap-1.5 rounded-[10px] bg-muted/60 px-2 py-1.5">
            <CornerDownRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 truncate text-xs" title={message.content}>{message.content.replace(/\s+/g, " ").trim()}</p>
            <Button type="button" variant="ghost" size="icon" className="size-6 rounded-full text-muted-foreground" aria-label={content.edit} title={content.edit} disabled={mutation.isPending || draft.trim().length > 0} onClick={() => mutation.mutate({ messages: [message], edit: true })}><Pencil className="size-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon" className="size-6 rounded-full text-muted-foreground hover:text-destructive" aria-label={content.remove} title={content.remove} disabled={mutation.isPending} onClick={() => mutation.mutate({ messages: [message], edit: false })}><Trash2 className="size-3.5" /></Button>
          </div>
        ))}
      </div>
    </section>
    </div>
  );
}
