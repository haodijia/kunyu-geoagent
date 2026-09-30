import { LoaderCircle, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { MessageStatus, SessionMessage } from "@/features/messages/api";
import type { AgentTurn, ToolCall } from "@/features/agent/api";
import { ToolActivity } from "@/features/agent/ToolActivity";
import { SessionEmptyState } from "@/features/sessions/SessionEmptyState";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.conversation;
const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit"
});

interface MessageListProps {
  readonly footer?: ReactNode;
  readonly messages: readonly SessionMessage[];
  readonly turns: readonly AgentTurn[];
}

const statusLabels: Record<Exclude<MessageStatus, "completed">, string> = {
  streaming: content.status.streaming,
  interrupted: content.status.interrupted,
  failed: content.status.failed,
  cancelled: content.status.cancelled
};

export function MessageList({ footer, messages, turns }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const followStreamRef = useRef(true);
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
    const scroller = endRef.current?.closest<HTMLElement>("[data-message-scroll]");
    if (scroller === undefined || scroller === null) return;
    const trackPosition = () => {
      const distanceFromEnd =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      followStreamRef.current = distanceFromEnd < 80;
    };
    scroller.addEventListener("scroll", trackPosition, { passive: true });
    return () => scroller.removeEventListener("scroll", trackPosition);
  }, [messages.length]);

  useEffect(() => {
    if (followStreamRef.current) {
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, turns]);

  if (messages.length === 0) {
    return (
      <SessionEmptyState
        description={content.emptyDescription}
        icon={MessageCircle}
        title={content.emptyTitle}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-2.5 px-6 py-5">
      {messages.map((message) => {
        const tools = toolsByMessage.get(message.id) ?? [];
        return (
          <article
            key={message.id}
            className={
              message.role === "user"
                ? "group ml-auto flex max-w-[82%] flex-col items-end"
                : "group mr-auto flex w-full flex-col items-start"
            }
          >
            {message.role === "user" ? (
              <div className="rounded-[8px_0_8px_8px] bg-[var(--message-user-bg)] px-2 py-1.5 text-sm leading-6 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
                {message.content}
              </div>
            ) : (
              <AssistantContent message={message} />
            )}
            {tools.length > 0 ? <ToolActivity tools={tools} /> : null}
            <div className={`mt-1 flex h-6 items-center gap-2 px-1 text-xs text-muted-foreground transition-opacity ${message.status === "completed" ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" : "opacity-100"}`}>
              {message.status !== "completed" ? (
                <span className="inline-flex items-center gap-1" role="status">
                  {message.status === "streaming" ? (
                    <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
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
    </div>
  );
}

function AssistantContent({ message }: { readonly message: SessionMessage }) {
  if (message.content.length === 0) {
    return message.status === "completed" ? null : (
      <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
        {message.status === "streaming" ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        ) : null}
        <span>{statusLabels[message.status]}</span>
      </div>
    );
  }
  return (
    <div className="w-full text-sm leading-7 text-foreground [overflow-wrap:anywhere]">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a className="text-foreground underline underline-offset-4" href={href}>
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-border pl-4 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">
              {children}
            </code>
          ),
          h1: ({ children }) => <Heading>{children}</Heading>,
          h2: ({ children }) => <Heading>{children}</Heading>,
          h3: ({ children }) => <Heading>{children}</Heading>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
          p: ({ children }) => <p className="my-0 mb-3 last:mb-0">{children}</p>,
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-5">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <table className="my-3 w-full border-collapse text-left text-xs">
              {children}
            </table>
          ),
          td: ({ children }) => <td className="border border-border px-2 py-1.5">{children}</td>,
          th: ({ children }) => <th className="border border-border bg-muted px-2 py-1.5">{children}</th>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>
        }}
      >
        {message.content}
      </Markdown>
      {message.status === "streaming" ? (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-muted-foreground align-text-bottom" />
      ) : null}
    </div>
  );
}

function Heading({ children }: { readonly children: ReactNode }) {
  return <h3 className="mt-5 mb-2 text-sm font-semibold first:mt-0">{children}</h3>;
}
