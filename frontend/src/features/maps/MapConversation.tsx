import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, History, MessageCircle } from "lucide-react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString } from "mdast-util-to-string";
import { Button } from "@/components/ui/button";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { EventStreamNotice } from "@/features/events/EventStreamNotice";
import { streamPresentation } from "@/features/events/stream-presentation";
import { assistantOutputLimit } from "@/features/events/live-assistant";
import { MessageList } from "@/features/messages/MessageList";
import { useSessionMessages } from "@/features/messages/SessionMessagesContext";
import { useMessageNavigation } from "@/features/messages/navigation/MessageNavigationContext";
import { zhCN } from "@/locales/zh-CN";

const parser = unified().use(remarkParse);
const content = zhCN.mapConversation;
interface Line {
  readonly id: string;
  readonly text: string;
}

export function MapConversation() {
  const { messagesQuery, agentTurnsQuery, confirmationsQuery } =
    useSessionMessages();
  const stream = useSessionEvents();
  const navigation = useMessageNavigation();
  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(0);
  const [lines, setLines] = useState<readonly Line[]>([]);
  const measure = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const rows = useMemo(() => {
    const messages = messagesQuery.data ?? [];
    const active = stream.activeAssistant;
    const turn =
      active === null
        ? undefined
        : agentTurnsQuery.data?.find((turn) => turn.id === active.run_id);
    const live =
      active === null || turn === undefined
        ? null
        : streamPresentation(
            active.stream,
            assistantOutputLimit(
              active,
              turn.budget.max_output_codepoints,
              stream.records,
            ),
          ).text;
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
    agentTurnsQuery.data,
    stream.activeAssistant,
    stream.records,
  ]);
  const generating = stream.activeAssistant !== null;
  const latestTurn = agentTurnsQuery.data?.at(-1);
  useEffect(() => {
    const node = measure.current;
    if (node === null) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [expanded]);
  useLayoutEffect(() => {
    const node = measure.current;
    if (node === null || width === 0) return;
    const frame = requestAnimationFrame(() => {
      const measured: Line[] = [];
      const origin = node.getBoundingClientRect().top;
      for (const row of node.children) {
        const text = row.firstChild;
        if (text === null || text.nodeType !== Node.TEXT_NODE) continue;
        const value = text.textContent ?? "";
        const range = document.createRange();
        let top: number | null = null;
        let line: { id: string; text: string } | null = null;
        let index = Math.max(0, value.length - 1400);
        for (const character of value.slice(index)) {
          range.setStart(text, index);
          range.setEnd(text, index + character.length);
          const currentTop = Math.round(
            (range.getBoundingClientRect().top - origin) / 24,
          );
          if (top !== currentTop) {
            line = { id: `${row.getAttribute("data-id")}:${index}`, text: "" };
            measured.push(line);
            top = currentTop;
          }
          if (line !== null && character !== "\n") line.text += character;
          index += character.length;
        }
      }
      setLines(measured.filter((line) => line.text.trim() !== "").slice(-4));
    });
    return () => cancelAnimationFrame(frame);
  }, [rows, width, expanded]);
  useEffect(() => {
    setHidden(0);
    if (paused || expanded || generating) return;
    const timers = [0, 1, 2].map((index) =>
      window.setTimeout(() => setHidden(index + 1), 10000 + index * 400),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [rows, paused, expanded, generating]);

  return (
    <div
      className="map-conversation mx-auto w-full max-w-[928px] px-6 pb-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPaused(false);
      }}
    >
      <div className="flex items-center justify-end gap-2 py-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 rounded-full bg-background/75 text-[11px] backdrop-blur"
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
          className="message-list-scroller max-h-[45vh] overflow-y-auto rounded-2xl border border-border/70 bg-background/95 shadow-sm backdrop-blur-xl"
          data-message-scroll
        >
          <MessageList
            navigation={navigation}
            messages={messagesQuery.data ?? []}
            turns={agentTurnsQuery.data ?? []}
            confirmations={confirmationsQuery.data ?? []}
          />
        </div>
      ) : (
        <div
          className="map-flow relative h-[72px] overflow-hidden"
          aria-label={content.messages}
        >
          <div
            ref={measure}
            aria-hidden="true"
            className="map-flow-measure pointer-events-none invisible absolute inset-x-0 top-0 whitespace-pre-wrap break-words text-sm leading-6"
          >
            {rows.map((row) => (
              <div key={row.id} data-id={row.id}>
                {row.text}
              </div>
            ))}
          </div>
          {lines.map((line, index) => {
            const distance = lines.length - 1 - index;
            return (
              <div
                key={line.id}
                className="map-flow-line absolute right-0 bottom-0 left-0 truncate text-sm leading-6"
                style={{
                  transform: `translateY(${-distance * 24}px)`,
                  opacity:
                    distance >= 3 ||
                    index < Math.max(0, lines.length - 3) + hidden
                      ? 0
                      : [1, 0.65, 0.3][distance],
                }}
              >
                {line.text}
              </div>
            );
          })}
          {lines.length === 0 && (
            <div className="flex h-full items-end gap-2 pb-1 text-xs text-muted-foreground">
              <MessageCircle className="size-3.5" />
              {content.continue}
            </div>
          )}
        </div>
      )}
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
