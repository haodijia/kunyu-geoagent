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
import { TaskStarter } from "@/features/sessions/TaskStarter";
import { zhCN } from "@/locales/zh-CN";
import { computed, defineComponent, toRefs } from "vue";
export const ConversationView = defineComponent(
  (_props, { slots: _slots }) => {
    const navigation = useMessageNavigation();
    const eventStream = useSessionEvents();
    const { messagesQuery, agentTurnsQuery, confirmationsQuery } =
      toRefs(useSessionMessages());
    const snapshot = computed(() =>
      conversationAssembler.assemble("chat", {
        confirmations: confirmationsQuery.value.data ?? [],
        events: eventStream.records,
        activeAssistant: eventStream.activeAssistant,
        messages: messagesQuery.value.data ?? [],
        turns: agentTurnsQuery.value.data ?? [],
      }),
    );
    return () => {
      const _snapshot = snapshot.value;
      return (
        <div class="chat-surface-container flex h-full min-h-0 flex-col bg-background">
          <div class="relative min-h-0 flex-1">
            <div
              class="message-list-scroller h-full min-h-0 overflow-y-auto"
              data-message-scroll
            >
              {messagesQuery.value.isPending && (
                <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {zhCN.conversation.loading}
                </div>
              )}
              {messagesQuery.value.isError && (
                <div class="flex flex-col items-center gap-3 py-8 text-sm">
                  <p role="alert" class="text-destructive">
                    {zhCN.conversation.loadFailed}
                  </p>
                  <button
                    type="button"
                    onClick={() => void messagesQuery.value.refetch()}
                  >
                    {zhCN.conversation.retry}
                  </button>
                </div>
              )}
              {eventStream.status !== "connected" && (
                <div class="mx-auto max-w-[920px] px-6 pt-4">
                  <EventStreamNotice
                    error={eventStream.error}
                    status={eventStream.status}
                  />
                </div>
              )}
              {messagesQuery.value.data !== undefined && (
                <MessageList
                  emptyState={<TaskStarter />}
                  navigation={navigation}
                  footer={<AgentControls embedded />}
                  messages={_snapshot.messages}
                  turns={_snapshot.turns}
                  confirmations={_snapshot.confirmations}
                />
              )}
            </div>
            <MessageAnchorRail />
          </div>
          <SessionComposer />
          <SelectionReplyButton />
        </div>
      );
    };
  },
  {
    name: "ConversationView",
    inheritAttrs: false,
    props: [],
  },
);
