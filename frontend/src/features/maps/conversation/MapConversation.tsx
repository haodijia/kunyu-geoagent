import { Button } from "@/components/ui/button";
import { EventStreamNotice } from "@/features/events/EventStreamNotice";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { mapConversationRows } from "@/features/maps/conversation/map-conversation";
import { MapMessageFlow } from "@/features/maps/conversation/MapMessageFlow";
import { useMessageNavigation } from "@/features/messages/navigation/MessageNavigationContext";
import { MessageList } from "@/features/messages/rendering/MessageList";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { zhCN } from "@/locales/zh-CN";
import { ChevronDown, History } from "lucide-react";
import { useMemo, useState } from "react";

const content = zhCN.mapConversation;

export function MapConversation() {
  const { messagesQuery, agentTurnsQuery, confirmationsQuery } =
    useSessionMessages();
  const stream = useSessionEvents();
  const navigation = useMessageNavigation();
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => mapConversationRows(
    messagesQuery.data ?? [], agentTurnsQuery.data ?? [], stream.records, stream.activeAssistant,
  ), [messagesQuery.data, agentTurnsQuery.data, stream.records, stream.activeAssistant]);
  const latestTurn = agentTurnsQuery.data?.at(-1);

  return (
    <div className="map-conversation">
      {((messagesQuery.data?.length ?? 0) > 0 || rows.length > 0 || expanded) && (
        <div className="map-history-row">
          <Button
            variant="ghost"
            size="sm"
            className="map-history-button h-7 gap-1.5 rounded-lg border border-border/60 bg-background/95 px-2 text-[11px] font-normal text-muted-foreground focus-visible:border-foreground/40 focus-visible:ring-1 focus-visible:ring-foreground/20"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <History className="size-3" />
            )}
            {expanded ? content.closeHistory : content.history}
          </Button>
        </div>
      )}
      {stream.status !== "connected" && (
        <EventStreamNotice status={stream.status} error={stream.error} />
      )}
      {messagesQuery.isError && (
        <p role="alert" className="py-2 text-xs text-destructive">
          {zhCN.conversation.loadFailed}
        </p>
      )}
      {expanded ? (
        <div
          className="message-list-scroller max-h-[min(45vh,360px)] overflow-y-auto rounded-2xl border border-border/70 bg-background/95 shadow-sm backdrop-blur-xl"
          data-message-scroll
        >
          <MessageList
            navigation={navigation}
            messages={messagesQuery.data ?? []}
            turns={agentTurnsQuery.data ?? []}
            confirmations={confirmationsQuery.data ?? []}
          />
        </div>
      ) : rows.length > 0 ? (
        <MapMessageFlow rows={rows} onOpen={() => setExpanded(true)} />
      ) : null}
      {latestTurn?.state === "failed" && (
        <div
          role="alert"
          className="mt-2 rounded-xl border border-destructive/20 bg-background/95 px-3 py-2 text-xs text-destructive"
        >
          <p>{content.runFailed}</p>
          {latestTurn.pause_reason !== null && (
            <p className="mt-1 break-words">{latestTurn.pause_reason}</p>
          )}
          <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>
            {content.history}
          </Button>
        </div>
      )}
    </div>
  );
}
