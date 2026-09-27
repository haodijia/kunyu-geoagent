import { MessageCircle } from "lucide-react";
import { useEffect, useRef } from "react";

import type { UserMessage } from "@/features/messages/api";
import { SessionEmptyState } from "@/features/sessions/SessionEmptyState";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.conversation;
const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit"
});

interface MessageListProps {
  readonly messages: readonly UserMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

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
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-7 px-6 py-10">
      {messages.map((message) => (
        <article
          key={message.id}
          className="ml-auto flex max-w-[76%] flex-col items-end"
        >
          <div className="rounded-[18px_18px_5px_18px] bg-slate-100 px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap text-slate-900 [overflow-wrap:anywhere]">
            {message.content}
          </div>
          <time
            className="mt-1.5 px-1 text-xs text-slate-400"
            dateTime={message.created_at}
          >
            {timeFormatter.format(new Date(message.created_at))}
          </time>
        </article>
      ))}
      <div ref={endRef} />
    </div>
  );
}
