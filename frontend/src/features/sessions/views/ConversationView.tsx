import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  appendUserMessage,
  listMessages,
  messageQueryKeys
} from "@/features/messages/api";
import { ConversationComposer } from "@/features/messages/ConversationComposer";
import { MessageList } from "@/features/messages/MessageList";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.conversation;

export function ConversationView() {
  const session = useSessionWorkspace();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const queryKey = messageQueryKeys.session(session.id);
  const messagesQuery = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await listMessages(session.id);
      } catch (error) {
        console.error("[conversation] Failed to load messages.", {
          error,
          sessionId: session.id
        });
        throw error;
      }
    }
  });
  const appendMutation = useMutation({
    mutationFn: (message: string) => appendUserMessage(session.id, message),
    onError: (error) => {
      console.error("[conversation] Failed to append user message.", {
        error,
        sessionId: session.id
      });
    }
  });

  function changeDraft(nextDraft: string) {
    appendMutation.reset();
    setDraft(nextDraft);
  }

  function sendMessage() {
    if (messagesQuery.data === undefined) {
      throw new Error("Messages must be loaded before sending.");
    }
    const currentMessages = messagesQuery.data;
    appendMutation.reset();
    appendMutation.mutate(draft, {
      onSuccess: (message) => {
        queryClient.setQueryData(queryKey, [...currentMessages, message]);
        setDraft("");
      }
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messagesQuery.isPending ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            {content.loading}
          </div>
        ) : null}
        {messagesQuery.isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="m-0 text-sm text-red-600" role="alert">
              {content.loadFailed}
            </p>
            <button
              type="button"
              className="text-sm font-medium text-slate-700 underline-offset-4 hover:underline"
              onClick={() => void messagesQuery.refetch()}
            >
              {content.retry}
            </button>
          </div>
        ) : null}
        {messagesQuery.data === undefined ? null : (
          <MessageList messages={messagesQuery.data} />
        )}
      </div>
      {messagesQuery.data === undefined ? null : (
        <ConversationComposer
          draft={draft}
          error={appendMutation.isError ? content.sendFailed : null}
          pending={appendMutation.isPending}
          onDraftChange={changeDraft}
          onSubmit={sendMessage}
        />
      )}
    </div>
  );
}
