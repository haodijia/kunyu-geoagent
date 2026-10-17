import { AgentControls } from "@/features/agent/controls/AgentControls";
import { conversationAssembler } from "@/features/conversation/assembler";
import { EventStreamNotice } from "@/features/events/EventStreamNotice";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { SelectionReplyButton } from "@/features/messages/composer/SelectionReplyButton";
import { SessionComposer } from "@/features/messages/composer/SessionComposer";
import { MessageAnchorRail } from "@/features/messages/navigation/MessageAnchorRail";
import { useMessageNavigation } from "@/features/messages/navigation/MessageNavigationContext";
import { MessageList } from "@/features/messages/rendering/MessageList";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { zhCN } from "@/locales/zh-CN";
import { useMemo } from "react";

export function ConversationView() {
  const navigation = useMessageNavigation();
  const eventStream = useSessionEvents();
  const { messagesQuery, agentTurnsQuery, confirmationsQuery } =
    useSessionMessages();
  const snapshot = useMemo(
    () =>
      conversationAssembler.assemble("chat", {
        confirmations: confirmationsQuery.data ?? [],
        events: eventStream.records,
        activeAssistant: eventStream.activeAssistant,
        messages: messagesQuery.data ?? [],
        turns: agentTurnsQuery.data ?? [],
      }),
    [
      agentTurnsQuery.data,
      confirmationsQuery.data,
      eventStream.records,
      eventStream.activeAssistant,
      messagesQuery.data,
    ],
  );
  return (
    <div className="chat-surface-container flex h-full min-h-0 flex-col bg-background">
      <div className="relative min-h-0 flex-1">
      <div
        className="message-list-scroller h-full min-h-0 overflow-y-auto"
        data-message-scroll
      >
        {messagesQuery.isPending && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {zhCN.conversation.loading}
          </div>
        )}
        {messagesQuery.isError && (
          <div className="flex flex-col items-center gap-3 py-8 text-sm">
            <p role="alert" className="text-destructive">
              {zhCN.conversation.loadFailed}
            </p>
            <button type="button" onClick={() => void messagesQuery.refetch()}>
              {zhCN.conversation.retry}
            </button>
          </div>
        )}
        {eventStream.status !== "connected" && (
          <div className="mx-auto max-w-[920px] px-6 pt-4">
            <EventStreamNotice
              error={eventStream.error}
              status={eventStream.status}
            />
          </div>
        )}
        {messagesQuery.data !== undefined && (
          <MessageList
            navigation={navigation}
            footer={<AgentControls embedded />}
            messages={snapshot.messages}
            turns={snapshot.turns}
            confirmations={snapshot.confirmations}
          />
        )}
      </div>
      <MessageAnchorRail />
      </div>
      <SessionComposer />
      <SelectionReplyButton />
    </div>
  );
}
