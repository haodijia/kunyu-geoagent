import { Button } from "@/components/ui/button";
import { EventStreamNotice } from "@/features/events/EventStreamNotice";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { mapConversationRows } from "@/features/maps/conversation/map-conversation";
import { MapMessageFlow } from "@/features/maps/conversation/MapMessageFlow";
import { useMessageNavigation } from "@/features/messages/navigation/MessageNavigationContext";
import { MessageList } from "@/features/messages/rendering/MessageList";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { ChevronDown, History } from "lucide-vue-next";
import { computed, defineComponent, shallowRef, toRefs } from "vue";
const content = zhCN.mapConversation;
export const MapConversation = defineComponent(
  (_props, { slots: _slots }) => {
    const { messagesQuery, agentTurnsQuery, confirmationsQuery } =
      toRefs(useSessionMessages());
    const stream = useSessionEvents();
    const navigation = useMessageNavigation();
    const expanded = shallowRef(false),
      setExpanded = refSetter(expanded);
    const rows = computed(() =>
      mapConversationRows(
        messagesQuery.value.data ?? [],
        agentTurnsQuery.value.data ?? [],
        stream.records,
        stream.activeAssistant,
      ),
    );
    const latestTurn = computed(() => agentTurnsQuery.value.data?.at(-1));
    return () => {
      const _rows = rows.value,
        _latestTurn = latestTurn.value;
      return (
        <div class="map-conversation">
          {((messagesQuery.value.data?.length ?? 0) > 0 ||
            _rows.length > 0 ||
            expanded.value) && (
            <div class="map-history-row">
              <Button
                variant="ghost"
                size="sm"
                class="map-history-button h-7 gap-1.5 rounded-lg border border-border/60 bg-background/95 px-2 text-[11px] font-normal text-muted-foreground focus-visible:border-foreground/40 focus-visible:ring-1 focus-visible:ring-foreground/20"
                aria-expanded={expanded.value}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded.value ? (
                  <ChevronDown class="size-3" />
                ) : (
                  <History class="size-3" />
                )}
                {expanded.value ? content.closeHistory : content.history}
              </Button>
            </div>
          )}
          {stream.status !== "connected" && (
            <EventStreamNotice status={stream.status} error={stream.error} />
          )}
          {messagesQuery.value.isError && (
            <p role="alert" class="py-2 text-xs text-destructive">
              {zhCN.conversation.loadFailed}
            </p>
          )}
          {expanded.value ? (
            <div
              class="message-list-scroller max-h-[min(45vh,360px)] overflow-y-auto rounded-2xl border border-border/70 bg-background/95 shadow-sm backdrop-blur-xl"
              data-message-scroll
            >
              <MessageList
                navigation={navigation}
                messages={messagesQuery.value.data ?? []}
                turns={agentTurnsQuery.value.data ?? []}
                confirmations={confirmationsQuery.value.data ?? []}
              />
            </div>
          ) : _rows.length > 0 ? (
            <MapMessageFlow rows={_rows} onOpen={() => setExpanded(true)} />
          ) : null}
          {_latestTurn?.state === "failed" && (
            <div
              role="alert"
              class="mt-2 rounded-xl border border-destructive/20 bg-background/95 px-3 py-2 text-xs text-destructive"
            >
              <p>{content.runFailed}</p>
              {_latestTurn.pause_reason !== null && (
                <p class="mt-1 break-words">{_latestTurn.pause_reason}</p>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(true)}
              >
                {content.history}
              </Button>
            </div>
          )}
        </div>
      );
    };
  },
  {
    name: "MapConversation",
    inheritAttrs: false,
    props: [],
  },
);
