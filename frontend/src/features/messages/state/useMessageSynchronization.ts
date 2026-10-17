import { agentQueryKeys } from "@/features/agent/api";
import { confirmationQueryKeys } from "@/features/confirmations/api";
import type { SessionEvent } from "@/features/events/api";
import { messageQueryKeys, type SessionMessage } from "@/features/messages/api";
import { questionQueryKeys } from "@/features/questions/api";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyMessageEvent, isMessageEvent } from "./message-event-cache";

const MAX_PENDING_MESSAGE_EVENTS = 256;
const TERMINAL_RUN_EVENTS = new Set([
  "run.completed",
  "run.failed",
  "run.cancelled",
  "run.interrupted",
]);

export function useMessageSynchronization(
  sessionId: string,
  events: readonly SessionEvent[],
  messagesQuery: UseQueryResult<SessionMessage[]>,
): void {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => messageQueryKeys.session(sessionId),
    [sessionId],
  );
  const seenSequenceRef = useRef(0);
  const pendingMessageEventsRef = useRef<SessionEvent[]>([]);
  const snapshotRequiredSequenceRef = useRef(0);
  const lastSnapshotRequestSequenceRef = useRef(0);
  const snapshotRequestPendingRef = useRef(false);
  const [reconcileRevision, setReconcileRevision] = useState(0);

  useEffect(() => {
    let needsMessageSnapshot = false;
    let refreshAgentTurns = false;
    let refreshConfirmations = false;
    let refreshQuestions = false;

    for (const event of events) {
      if (event.sequence <= seenSequenceRef.current) continue;
      if (event.sequence !== seenSequenceRef.current + 1) {
        needsMessageSnapshot = true;
      }
      seenSequenceRef.current = event.sequence;
      if (isMessageEvent(event)) {
        if (
          pendingMessageEventsRef.current.length >= MAX_PENDING_MESSAGE_EVENTS
        ) {
          pendingMessageEventsRef.current = [];
          needsMessageSnapshot = true;
        }
        pendingMessageEventsRef.current.push(event);
      }
      refreshAgentTurns ||=
        event.event_type.startsWith("run.") ||
        event.event_type.startsWith("tool.") ||
        event.event_type.startsWith("confirmation.") ||
        event.event_type.startsWith("question.");
      refreshConfirmations ||=
        event.event_type === "confirmation.requested" ||
        event.event_type === "confirmation.resolved";
      refreshQuestions ||=
        event.event_type.startsWith("question.") ||
        TERMINAL_RUN_EVENTS.has(event.event_type);
      needsMessageSnapshot ||=
        TERMINAL_RUN_EVENTS.has(event.event_type) ||
        event.event_type === "agent/inbox/spliced";
    }

    const cached = queryClient.getQueryData<SessionMessage[]>(queryKey);
    if (cached !== undefined) {
      let merged = cached;
      while (pendingMessageEventsRef.current.length > 0) {
        const event = pendingMessageEventsRef.current[0];
        if (event === undefined) break;
        const result = applyMessageEvent(merged, event);
        if (result.needsSnapshot) {
          needsMessageSnapshot = true;
          break;
        }
        merged = result.messages;
        pendingMessageEventsRef.current.shift();
      }
      if (merged !== cached) queryClient.setQueryData(queryKey, merged);
    }

    if (needsMessageSnapshot) {
      snapshotRequiredSequenceRef.current = Math.max(
        snapshotRequiredSequenceRef.current,
        seenSequenceRef.current,
      );
    }
    if (
      !snapshotRequestPendingRef.current &&
      lastSnapshotRequestSequenceRef.current <
        snapshotRequiredSequenceRef.current
    ) {
      snapshotRequestPendingRef.current = true;
      lastSnapshotRequestSequenceRef.current =
        snapshotRequiredSequenceRef.current;
      void messagesQuery.refetch({ cancelRefetch: true }).finally(() => {
        snapshotRequestPendingRef.current = false;
        setReconcileRevision((current) => current + 1);
      });
    }
    if (refreshAgentTurns) {
      void queryClient.invalidateQueries({
        queryKey: agentQueryKeys.session(sessionId),
      });
    }
    if (refreshQuestions)
      void queryClient.invalidateQueries({
        queryKey: questionQueryKeys.session(sessionId),
      });
    if (refreshConfirmations) {
      void queryClient.invalidateQueries({
        queryKey: confirmationQueryKeys.session(sessionId),
      });
    }
  }, [
    events,
    messagesQuery.data,
    messagesQuery.refetch,
    queryClient,
    queryKey,
    reconcileRevision,
    sessionId,
  ]);
}
