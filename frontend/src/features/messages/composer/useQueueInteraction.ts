import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/api/client";
import { acquireQueueInteraction, releaseQueueInteraction, renewQueueInteraction, type QueueInteractionLease } from "@/features/agent/api";
import { zhCN } from "@/locales/zh-CN";

class QueueInteraction {
  readonly id = crypto.randomUUID();
  readonly ready: Promise<boolean>;
  valid = false;
  ending = false;
  private closed = false;
  private closing: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly sessionId: string, messageIds: readonly string[]) {
    this.ready = this.acquire(messageIds);
  }

  private async acquire(messageIds: readonly string[]): Promise<boolean> {
    try {
      const lease = await acquireQueueInteraction(this.sessionId, this.id, messageIds);
      this.valid = !this.closed;
      this.schedule(lease);
      return true;
    } catch (error) {
      this.report(error);
      return false;
    }
  }

  private schedule(lease: QueueInteractionLease) {
    if (!Number.isSafeInteger(lease.lease_milliseconds) || lease.lease_milliseconds <= 0) throw new Error("Invalid queue interaction lease.");
    if (!this.closed) this.timer = setTimeout(() => void this.renew(), lease.lease_milliseconds / 3);
  }

  private async renew() {
    try {
      const lease = await renewQueueInteraction(this.sessionId, this.id);
      this.schedule(lease);
    } catch (error) {
      this.valid = false;
      if (!this.closed) this.report(error);
      else console.debug("[inbox] Queue renewal ended after interaction closed.", { sessionId: this.sessionId, error });
    }
  }

  close(): Promise<void> {
    if (this.closing === null) this.closing = this.release();
    return this.closing;
  }

  private async release(): Promise<void> {
    this.closed = true;
    this.valid = false;
    if (this.timer !== null) clearTimeout(this.timer);
    await this.ready;
    try {
      await releaseQueueInteraction(this.sessionId, this.id);
    } catch (error) {
      console.error("[inbox] Failed to release queue interaction.", { sessionId: this.sessionId, interactionId: this.id, error });
    }
  }

  private report(error: unknown) {
    console.error("[inbox] Queue interaction could not continue.", { sessionId: this.sessionId, interactionId: this.id, error });
    toast.error(error instanceof ApiError && error.status === 409 ? zhCN.conversation.queue.queueChanged : zhCN.conversation.queue.interactionFailed);
  }
}

export function useQueueInteraction(sessionId: string) {
  const interactionRef = useRef<QueueInteraction | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => () => {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (interaction !== null) void interaction.close();
  }, [sessionId]);

  const begin = useCallback((messageIds: readonly string[]) => {
    if (interactionRef.current !== null) throw new Error("A queue interaction is already active.");
    interactionRef.current = new QueueInteraction(sessionId, messageIds);
  }, [sessionId]);

  const finish = useCallback(async (drop?: () => Promise<void>) => {
    const interaction = interactionRef.current;
    if (interaction === null || interaction.ending) return;
    interaction.ending = true;
    setFinishing(true);
    try {
      if (await interaction.ready && interaction.valid && drop !== undefined) await drop();
    } finally {
      await interaction.close();
      if (interactionRef.current === interaction) interactionRef.current = null;
      setFinishing(false);
    }
  }, []);

  return { begin, finish, finishing };
}
