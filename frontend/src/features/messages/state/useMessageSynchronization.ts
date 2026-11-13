import { agentQueryKeys } from "@/features/agent/api";
import { confirmationQueryKeys } from "@/features/confirmations/api";
import type { SessionEvent } from "@/features/events/api";
import { messageQueryKeys, type SessionMessage } from "@/features/messages/api";
import { questionQueryKeys } from "@/features/questions/api";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, shallowRef, toValue, type MaybeRefOrGetter } from "vue";
import { applyMessageEvent, isMessageEvent } from "./message-event-cache";
const MAX_PENDING_MESSAGE_EVENTS = 256;
const TERMINAL_RUN_EVENTS = new Set([
  "run.completed",
  "run.failed",
  "run.cancelled",
  "run.interrupted",
]);
export function useMessageSynchronization(
  sessionId: MaybeRefOrGetter<string>,
  events: MaybeRefOrGetter<readonly SessionEvent[]>,
  messagesQuery: MaybeRefOrGetter<{
    readonly data: SessionMessage[] | undefined;
    readonly refetch: (options?: {
      cancelRefetch?: boolean;
    }) => Promise<unknown>;
  }>,
): void {
  const queryClient = useQueryClient();
  const queryKey = computed(() => messageQueryKeys.session(toValue(sessionId)));
  const seenSequenceRef = shallowRef(0);
  const pendingMessageEventsRef = shallowRef<SessionEvent[]>([]);
  const snapshotRequiredSequenceRef = shallowRef(0);
  const lastSnapshotRequestSequenceRef = shallowRef(0);
  const snapshotRequestPendingRef = shallowRef(false);
  const reconcileRevision = shallowRef(0),
    setReconcileRevision = refSetter(reconcileRevision);
  watchMounted(
    [
      () => toValue(events),
      () => toValue(messagesQuery).data,
      () => toValue(messagesQuery).refetch,
      () => queryClient,
      () => queryKey.value,
      () => reconcileRevision.value,
      () => toValue(sessionId),
    ],
    () => {
      let needsMessageSnapshot = false;
      let refreshAgentTurns = false;
      let refreshConfirmations = false;
      let refreshQuestions = false;
      for (const event of toValue(events)) {
        if (event.sequence <= seenSequenceRef.value) continue;
        if (event.sequence !== seenSequenceRef.value + 1) {
          needsMessageSnapshot = true;
        }
        seenSequenceRef.value = event.sequence;
        if (isMessageEvent(event)) {
          if (
            pendingMessageEventsRef.value.length >= MAX_PENDING_MESSAGE_EVENTS
          ) {
            pendingMessageEventsRef.value = [];
            needsMessageSnapshot = true;
          }
          pendingMessageEventsRef.value.push(event);
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
      const cached = queryClient.getQueryData<SessionMessage[]>(queryKey.value);
      if (cached !== undefined) {
        let merged = cached;
        while (pendingMessageEventsRef.value.length > 0) {
          const event = pendingMessageEventsRef.value[0];
          if (event === undefined) break;
          const result = applyMessageEvent(merged, event);
          if (result.needsSnapshot) {
            needsMessageSnapshot = true;
            break;
          }
          merged = result.messages;
          pendingMessageEventsRef.value.shift();
        }
        if (merged !== cached) queryClient.setQueryData(queryKey.value, merged);
      }
      if (needsMessageSnapshot) {
        snapshotRequiredSequenceRef.value = Math.max(
          snapshotRequiredSequenceRef.value,
          seenSequenceRef.value,
        );
      }
      if (
        !snapshotRequestPendingRef.value &&
        lastSnapshotRequestSequenceRef.value < snapshotRequiredSequenceRef.value
      ) {
        snapshotRequestPendingRef.value = true;
        lastSnapshotRequestSequenceRef.value =
          snapshotRequiredSequenceRef.value;
        void toValue(messagesQuery)
          .refetch({
            cancelRefetch: true,
          })
          .finally(() => {
            snapshotRequestPendingRef.value = false;
            setReconcileRevision((current) => current + 1);
          });
      }
      if (refreshAgentTurns) {
        void queryClient.invalidateQueries({
          queryKey: agentQueryKeys.session(toValue(sessionId)),
        });
      }
      if (refreshQuestions)
        void queryClient.invalidateQueries({
          queryKey: questionQueryKeys.session(toValue(sessionId)),
        });
      if (refreshConfirmations) {
        void queryClient.invalidateQueries({
          queryKey: confirmationQueryKeys.session(toValue(sessionId)),
        });
      }
    },
  );
}
