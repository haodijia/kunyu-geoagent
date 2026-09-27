import { EventStreamNotice } from "@/features/events/EventStreamNotice";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { MessageList } from "@/features/messages/MessageList";
import { SessionComposer } from "@/features/messages/SessionComposer";
import { useSessionMessages } from "@/features/messages/SessionMessagesContext";
import { zhCN } from "@/locales/zh-CN";

export function ConversationView() {
  const eventStream = useSessionEvents();
  const { messagesQuery } = useSessionMessages();
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messagesQuery.isPending && <div className="flex h-full items-center justify-center text-sm text-slate-500">{zhCN.conversation.loading}</div>}
        {messagesQuery.isError && <div className="flex flex-col items-center gap-3 py-8 text-sm">
          <p role="alert" className="text-red-600">{zhCN.conversation.loadFailed}</p>
          <button type="button" onClick={() => void messagesQuery.refetch()}>{zhCN.conversation.retry}</button>
        </div>}
        {eventStream.status !== "connected" && <div className="mx-auto max-w-[920px] px-6 pt-4">
          <EventStreamNotice error={eventStream.error} status={eventStream.status} />
        </div>}
        {messagesQuery.data !== undefined && <MessageList messages={messagesQuery.data} />}
      </div>
      <SessionComposer />
    </div>
  );
}
