import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString } from "mdast-util-to-string";
import { Button } from "@/components/ui/button";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { EventStreamNotice } from "@/features/events/EventStreamNotice";
import { streamPresentation } from "@/features/events/stream-presentation";
import { MessageList } from "@/features/messages/MessageList";
import { useSessionMessages } from "@/features/messages/SessionMessagesContext";
import { useMessageNavigation } from "@/features/messages/navigation/MessageNavigationContext";
import { zhCN } from "@/locales/zh-CN";

const parser = unified().use(remarkParse);
const content = zhCN.mapConversation;
interface FlowMessage {
  readonly id: string;
  readonly text: string;
}

export function MapConversation() {
  const { messagesQuery, agentTurnsQuery, confirmationsQuery } =
    useSessionMessages();
  const stream = useSessionEvents();
  const navigation = useMessageNavigation();
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => {
    const messages = messagesQuery.data ?? [];
    const active = stream.activeAssistant;
    const live =
      active === null
        ? null
        : streamPresentation(active.stream).text;
    const recent = messages.slice(-5).map((message) => ({
      id: message.id,
      text: `${message.role === "user" ? `${content.you} · ` : ""}${toString(parser.parse(message.id === active?.attempt_id && live !== null ? live : message.content))}`,
    }));
    if (
      active !== null &&
      live !== null &&
      !messages.some((message) => message.id === active.attempt_id)
    )
      recent.push({
        id: active.attempt_id,
        text: toString(parser.parse(live)),
      });
    return recent.filter((row) => row.text.trim() !== "");
  }, [
    messagesQuery.data,
    stream.activeAssistant,
  ]);
  const latestTurn = agentTurnsQuery.data?.at(-1);

  return (
    <div className="map-conversation">
      {((messagesQuery.data?.length ?? 0) > 0 || rows.length > 0 || expanded) && (
        <div className="map-history-row">
          <Button
            variant="ghost"
            size="sm"
            className="map-history-button h-7 gap-1.5 rounded-lg border border-border/60 bg-background/95 px-2 text-[11px] font-normal text-muted-foreground shadow-xs focus-visible:border-foreground/40 focus-visible:ring-1 focus-visible:ring-foreground/20"
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
        <MapMessageFlow rows={rows} />
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

function MapMessageFlow({ rows }: { readonly rows: readonly FlowMessage[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  const follow = useCallback(() => {
    const scroller = viewport.current;
    if (scroller === null) return;
    setOverflow(scroller.scrollHeight > scroller.clientHeight);
    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, []);

  useLayoutEffect(() => {
    const scroller = viewport.current;
    const node = track.current;
    if (scroller === null || node === null) return;
    scroller.scrollTop = scroller.scrollHeight;
    const observer = new ResizeObserver(follow);
    observer.observe(node);
    return () => observer.disconnect();
  }, [follow]);

  useLayoutEffect(follow, [rows, follow]);

  return (
    <div
      ref={viewport}
      className="map-flow"
      aria-label={content.messages}
      data-overflow={overflow}
    >
      <div ref={track} className="map-flow-track">
        {rows.map((row) => (
          <p key={row.id}>{row.text}</p>
        ))}
      </div>
    </div>
  );
}
