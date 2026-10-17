import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import type { AgentTurn } from "@/features/agent/api";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import type { SessionEvent } from "@/features/events/api";
import { zhCN } from "@/locales/zh-CN";

interface RetryWait {
  readonly retry: number;
  readonly maximum: number | null;
  readonly deadline: number;
}

function retryWait(events: readonly SessionEvent[], turns: readonly AgentTurn[]): RetryWait | null {
  const run = turns.find((turn) => turn.state === "model_running");
  if (run === undefined) return null;
  let pending: SessionEvent | null = null;
  for (const event of events) {
    if (event.run_id !== run.id) continue;
    if (event.event_type === "llm/retry") pending = event;
    if (["llm/retry-started", "request.header", "run.completed", "run.failed", "run.cancelled", "run.interrupted"].includes(event.event_type)) pending = null;
  }
  if (pending === null || pending.payload.step !== run.step) return null;
  const { retry, max_retries, delay_ms } = pending.payload;
  const started = Date.parse(pending.occurred_at);
  if (typeof retry !== "number" || !Number.isSafeInteger(retry) || typeof delay_ms !== "number" || !Number.isFinite(delay_ms) || !Number.isFinite(started) || max_retries !== null && typeof max_retries !== "number") throw new Error("Invalid durable retry plan.");
  return { retry, maximum: max_retries, deadline: started + delay_ms };
}

export function ModelRetryStatus({ turns }: { readonly turns: readonly AgentTurn[] }) {
  const { events } = useSessionEvents();
  const waiting = retryWait(events, turns);
  const [now, setNow] = useState(Date.now);
  const deadline = waiting?.deadline;
  useEffect(() => {
    if (deadline === undefined) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);
  if (waiting === null) return null;
  const seconds = Math.max(0, Math.ceil((waiting.deadline - now) / 1_000));
  const label = seconds > 0 ? zhCN.conversation.modelRetry.waiting(waiting.retry, waiting.maximum, seconds) : zhCN.conversation.modelRetry.connecting(waiting.retry, waiting.maximum);
  return <div role="status" aria-live="polite" className="flex min-w-0 items-center gap-2 rounded-t-[20px] px-2.5 py-2.5 text-sm leading-5 text-muted-foreground" style={{ background: "var(--thought-gradient)" }}><LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden="true" /><span className="min-w-0 flex-1 truncate" title={label}>{label}</span></div>;
}
