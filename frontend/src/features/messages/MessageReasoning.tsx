// Adapted from mu's MessageThinking (Apache-2.0, Copyright 2025 AionUi).
import { Brain, ChevronRight, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { zhCN } from "@/locales/zh-CN";
import type { MessageReasoning as Reasoning } from "./reasoning";

const content = zhCN.conversation.thinking;

export function MessageReasoning({
  id, reasoning, active, updatedAt,
}: {
  readonly id: string;
  readonly reasoning: Reasoning;
  readonly active: boolean;
  readonly updatedAt: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active, reasoning.startedAt]);
  useEffect(() => {
    if (active && expanded && bodyRef.current !== null) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [reasoning.text, active, expanded]);

  const ended = reasoning.finishedAt === null ? (active ? now : Date.parse(updatedAt)) : Date.parse(reasoning.finishedAt);
  const seconds = Math.max(0, Math.floor((ended - Date.parse(reasoning.startedAt)) / 1_000));
  const duration = seconds >= 60 ? content.minutes(Math.floor(seconds / 60), seconds % 60) : content.seconds(seconds);
  const chars = Array.from(reasoning.text.replace(/\s+/g, " ").trim());
  const tail = chars.length > 120 ? `…${chars.slice(-120).join("")}` : chars.join("");

  return (
    <div className="message-thinking">
      <button type="button" className="message-thinking-header" aria-expanded={expanded} aria-controls={`thought-${id}`} onClick={() => setExpanded((value) => !value)}>
        {active ? <LoaderCircle className="size-3.5 animate-spin" /> : <Brain className="size-3.5" />}
        <span>{active ? content.running(duration) : content.completed(duration)}</span>
        <ChevronRight className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {active && !expanded && tail.length > 0 && <div className="message-thinking-stream" aria-hidden="true">{tail}</div>}
      {expanded && <div ref={bodyRef} id={`thought-${id}`} className="message-thinking-body">{reasoning.text}</div>}
    </div>
  );
}
