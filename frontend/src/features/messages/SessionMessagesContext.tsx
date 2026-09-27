import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { appendUserMessage, listMessages, messageQueryKeys, type UserMessage } from "./api";

function useMessages(sessionId: string) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const { records } = useSessionEvents();
  const queryKey = messageQueryKeys.session(sessionId);
  const messagesQuery = useQuery({ queryKey, queryFn: async () => {
    try { return await listMessages(sessionId); }
    catch (error) { console.error("[messages] Failed to load session messages.", { sessionId, error }); throw error; }
  } });
  const lastSequence = records.at(-1)?.sequence;
  useEffect(() => {
    if (lastSequence !== undefined) {
      void queryClient.invalidateQueries({ queryKey: messageQueryKeys.session(sessionId) });
    }
  }, [lastSequence, queryClient, sessionId]);
  const mutation = useMutation({
    mutationFn: (text: string) => appendUserMessage(sessionId, text),
    onSuccess: message => {
      queryClient.setQueryData<UserMessage[]>(queryKey, current => {
        if (current === undefined) return [message];
        if (current.some(item => item.id === message.id)) return current;
        return [...current, message].sort((left, right) => left.sequence - right.sequence);
      });
      setDraft("");
    },
    onError: error => console.error("[messages] Failed to send message.", { sessionId, error })
  });
  return {
    draft, messagesQuery, mutation,
    changeDraft: (value: string) => { mutation.reset(); setDraft(value); },
    sendMessage: () => { if (!mutation.isPending && draft.trim()) mutation.mutate(draft); }
  };
}

const Context = createContext<ReturnType<typeof useMessages> | null>(null);
export function SessionMessagesProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const state = useMessages(sessionId);
  return <Context value={state}>{children}</Context>;
}
export function useSessionMessages() {
  const state = useContext(Context);
  if (state === null) throw new Error("SessionMessagesProvider is required.");
  return state;
}
