import { ArrowDown, LoaderCircle, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

import type { MessageStatus, SessionMessage } from "@/features/messages/api";
import type { AgentTurn, ToolCall } from "@/features/agent/api";
import type { Confirmation } from "@/features/confirmations/api";
import { conversationSlots } from "@/features/conversation/slots";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { SessionEmptyState } from "@/features/sessions/SessionEmptyState";
import { zhCN } from "@/locales/zh-CN";
import { CopyButton } from "./CopyButton";
import { MessageMarkdown } from "./MessageMarkdown";
import { MessageReasoning } from "./MessageReasoning";
import { collectMessageReasoning } from "./reasoning";

const content = zhCN.conversation;
const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});

interface MessageListProps {
  readonly footer?: ReactNode;
  readonly confirmations: readonly Confirmation[];
  readonly messages: readonly SessionMessage[];
  readonly turns: readonly AgentTurn[];
}

const statusLabels: Record<Exclude<MessageStatus, "completed">, string> = {
  streaming: content.status.streaming,
  interrupted: content.status.interrupted,
  failed: content.status.failed,
  cancelled: content.status.cancelled,
};

export function MessageList({
  confirmations,
  footer,
  messages,
  turns,
}: MessageListProps) {
  const { records } = useSessionEvents();
  const reasoningByMessage = useMemo(() => collectMessageReasoning(records), [records]);
  const timeline = useMemo(() => {
    const sequenceByMessage = new Map<string, number>();
    for (const record of records) {
      if (record.messageId !== null && !sequenceByMessage.has(record.messageId)) {
        sequenceByMessage.set(record.messageId, record.sequence);
      }
    }
    const results = new Map(records.filter((record) => record.eventType === "command/done").map((record) => [record.entityId, record]));
    return [
      ...messages.map((message) => ({ kind: "message" as const, id: message.id, sequence: sequenceByMessage.get(message.id) ?? message.updated_sequence, message })),
      ...records.filter((record) => record.eventType === "command/run").map((record) => ({ kind: "command" as const, id: record.entityId, sequence: record.sequence, record, result: results.get(record.entityId) })),
    ].sort((left, right) => left.sequence - right.sequence);
  }, [messages, records]);
  const endRef = useRef<HTMLDivElement>(null);
  const followStreamRef = useRef(true);
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  const toolsByMessage = useMemo(() => {
    const grouped = new Map<string, ToolCall[]>();
    for (const tool of turns.flatMap((turn) => turn.tool_calls)) {
      const current = grouped.get(tool.message_id) ?? [];
      current.push(tool);
      grouped.set(tool.message_id, current);
    }
    for (const tools of grouped.values()) {
      tools.sort((left, right) => left.batch_index - right.batch_index);
    }
    return grouped;
  }, [turns]);

  useEffect(() => {
    const scroller = endRef.current?.closest<HTMLElement>(
      "[data-message-scroll]",
    );
    if (scroller === undefined || scroller === null) return;
    const trackPosition = () => {
      const distanceFromEnd =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      followStreamRef.current = distanceFromEnd < 80;
      setAwayFromEnd(!followStreamRef.current);
    };
    scroller.addEventListener("scroll", trackPosition, { passive: true });
    return () => scroller.removeEventListener("scroll", trackPosition);
  }, [timeline.length === 0]);

  useEffect(() => {
    if (followStreamRef.current) {
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, turns, timeline, reasoningByMessage]);

  if (timeline.length === 0) {
    return (
      <SessionEmptyState
        description={content.emptyDescription}
        icon={MessageCircle}
        title={content.emptyTitle}
      />
    );
  }

  return (
    <div className="chat-surface-fluid flex flex-col gap-4 px-3 py-5">
      {timeline.map((item) => {
        if (item.kind === "command") {
          return (
            <article key={item.id} className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
              <div className="font-mono">/{String(item.record.payload.name)}{typeof item.record.payload.raw_input === "string" ? item.record.payload.raw_input : ""}</div>
              <div role="status" className={`mt-1 whitespace-pre-wrap ${item.result?.payload.kind === "error" ? "text-destructive" : ""}`}>
                {typeof item.result?.payload.text === "string" ? item.result.payload.text : zhCN.conversation.commands.running}
              </div>
            </article>
          );
        }
        const message = item.message;
        const tools = toolsByMessage.get(message.id) ?? [];
        const reasoning = reasoningByMessage.get(message.id);
        const activeTurn = turns.find((turn) => turn.id === message.run_id);
        const active = activeTurn?.state === "model_running" && message.status === "streaming" &&
          activeTurn.step === message.step && activeTurn.attempt === message.attempt;
        return (
          <article
            key={message.id}
            className={
              message.role === "user"
                ? "group ml-auto flex w-full flex-col items-end"
                : "group mr-auto flex w-full flex-col items-start"
            }
          >
            {message.role === "assistant" && reasoning !== undefined && (
              <MessageReasoning id={message.id} reasoning={reasoning} active={active && message.content.length === 0} updatedAt={message.updated_at} />
            )}
            {message.role === "user" ? (
              <div className="max-w-full rounded-[8px] bg-[var(--message-user-bg)] px-2.5 py-2 text-[13px] leading-5 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
                {message.content}
              </div>
            ) : (
              message.content.length > 0 ? (
                <>
                  <MessageMarkdown text={message.content} />
                  {active && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-muted-foreground align-text-bottom" />}
                </>
              ) : active && reasoning === undefined ? (
                <div className="flex items-center gap-2 py-1 text-[13px] text-muted-foreground" role="status">
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />{content.status.streaming}
                </div>
              ) : null
            )}
            {tools.length > 0
              ? conversationSlots.render("message.tools", {
                  confirmations,
                  tools,
                })
              : null}
            <div
              className={`mt-1 flex h-6 items-center gap-2 px-1 text-xs text-muted-foreground transition-opacity ${message.status === "completed" ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" : "opacity-100"}`}
            >
              {message.content.length > 0 && <CopyButton text={message.content} />}
              {message.status !== "completed" ? (
                <span className="inline-flex items-center gap-1" role="status">
                  {message.status === "streaming" ? (
                    <LoaderCircle
                      className="size-3 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {statusLabels[message.status]}
                  {message.attempt !== null && message.attempt > 1
                    ? ` · ${content.attempt(message.attempt)}`
                    : null}
                </span>
              ) : null}
              <time dateTime={message.created_at}>
                {timeFormatter.format(new Date(message.created_at))}
              </time>
            </div>
          </article>
        );
      })}
      {footer}
      <div ref={endRef} />
      {awayFromEnd && (
        <div className="sticky bottom-2 z-10 flex h-0 justify-center">
          <Button type="button" variant="outline" size="icon" className="-translate-y-full rounded-full bg-background shadow-sm" aria-label={content.scrollToBottom} onClick={() => {
            followStreamRef.current = true;
            endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
          }}><ArrowDown className="size-4" /></Button>
        </div>
      )}
    </div>
  );
}
