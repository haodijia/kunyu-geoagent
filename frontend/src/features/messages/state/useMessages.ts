import { ApiError } from "@/api/client";
import { useAppUiStore } from "@/app/store";
import type { AgentTurn, QueuedAgentDraft } from "@/features/agent/api";
import {
  agentQueryKeys,
  listAgentTurns,
  mergeAgentTurns,
} from "@/features/agent/api";
import { useComposerAttachments } from "@/features/attachments/useComposerAttachments";
import type { Confirmation } from "@/features/confirmations/api";
import {
  confirmationQueryKeys,
  listConfirmations,
  mergeConfirmationSnapshots,
} from "@/features/confirmations/api";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import type { SessionMessage } from "@/features/messages/api";
import {
  appendUserMessage,
  listMessages,
  messageQueryKeys,
} from "@/features/messages/api";
import type { ReplyQuote } from "@/features/messages/model/reply-quote";
import { quotedMessage } from "@/features/messages/model/reply-quote";
import { mergeMessageSnapshots } from "@/features/messages/state/message-event-cache";
import { usableModelsFrom } from "@/features/messages/state/model-selection";
import { useMessageSynchronization } from "@/features/messages/state/useMessageSynchronization";
import type { HumanQuestion } from "@/features/questions/api";
import {
  listQuestions,
  mergeQuestions,
  questionQueryKeys,
} from "@/features/questions/api";
import { createMapContext } from "@/features/sessions/map-context";
import { modelConnectionsApi } from "@/features/settings/models/api";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  computed,
  reactive,
  shallowReactive,
  shallowRef,
  toRefs,
  toValue,
  type MaybeRefOrGetter,
} from "vue";
interface FrozenSubmission {
  readonly idempotencyKey: string;
  readonly content: string;
  readonly attachmentIds: readonly string[];
  readonly delivery: "followup" | "steer" | "queue";
  readonly connectionId: string;
  readonly modelId: string;
  readonly reasoningEffort: string | null;
  readonly mapContext: ReturnType<typeof createMapContext>;
}
export function useMessages(
  sessionId: MaybeRefOrGetter<string>,
  workspaceId: MaybeRefOrGetter<string>,
) {
  const queryClient = useQueryClient();
  const attachmentState = useComposerAttachments(() => toValue(sessionId));
  const draft = computed(() =>
    ((state) => state.composerDraftBySession[toValue(sessionId)] ?? "")(
      useAppUiStore(),
    ),
  );
  const queuedDraft = computed(() =>
    ((state) => state.composerQueuedBySession[toValue(sessionId)] === true)(
      useAppUiStore(),
    ),
  );
  const initialMapContext = computed(() =>
    createMapContext(toValue(workspaceId)),
  );
  const mapContext = computed(() =>
    ((state) =>
      state.mapContextBySession[toValue(sessionId)] ?? initialMapContext.value)(
      useAppUiStore(),
    ),
  );
  const modelSelection = computed(() =>
    ((state) => state.modelSelectionBySession[toValue(sessionId)])(
      useAppUiStore(),
    ),
  );
  const clearComposerDraft = computed(() =>
    ((state) => state.clearComposerDraft)(useAppUiStore()),
  );
  const setComposerDraft = computed(() =>
    ((state) => state.setComposerDraft)(useAppUiStore()),
  );
  const quote = computed(() =>
    ((state) => state.composerQuoteBySession[toValue(sessionId)] ?? null)(
      useAppUiStore(),
    ),
  );
  const setComposerQuote = computed(() =>
    ((state) => state.setComposerQuote)(useAppUiStore()),
  );
  const restoreComposerDraft = computed(() =>
    ((state) => state.restoreComposerDraft)(useAppUiStore()),
  );
  const setModelSelection = computed(() =>
    ((state) => state.setModelSelection)(useAppUiStore()),
  );
  const { events } = toRefs(useSessionEvents());
  const queryKey = computed(() => messageQueryKeys.session(toValue(sessionId)));
  const frozenSubmissionRef = shallowRef<FrozenSubmission | null>(null);
  const requestFrozen = shallowRef(false),
    setRequestFrozen = refSetter(requestFrozen);
  const messagesQuery = reactive(
    useQuery<SessionMessage[]>(
      computed(() => ({
        queryKey: queryKey.value,
        queryFn: async ({ signal }) => {
          const incoming = await listMessages(toValue(sessionId), signal);
          return mergeMessageSnapshots(
            queryClient.getQueryData<SessionMessage[]>(queryKey.value),
            incoming,
          );
        },
      })),
    ),
  );
  const connectionsQuery = reactive(
    useQuery(
      computed(() => ({
        queryKey: ["model-connections"],
        queryFn: modelConnectionsApi.list,
      })),
    ),
  );
  const agentTurnsQuery = reactive(
    useQuery<AgentTurn[]>(
      computed(() => ({
        queryKey: agentQueryKeys.session(toValue(sessionId)),
        queryFn: async () => {
          const incoming = await listAgentTurns(toValue(sessionId));
          return mergeAgentTurns(
            queryClient.getQueryData<AgentTurn[]>(
              agentQueryKeys.session(toValue(sessionId)),
            ),
            incoming,
          );
        },
      })),
    ),
  );
  const confirmationsQuery = reactive(
    useQuery<Confirmation[]>(
      computed(() => ({
        queryKey: confirmationQueryKeys.session(toValue(sessionId)),
        queryFn: async () => {
          const incoming = await listConfirmations(toValue(sessionId));
          return mergeConfirmationSnapshots(
            queryClient.getQueryData<Confirmation[]>(
              confirmationQueryKeys.session(toValue(sessionId)),
            ),
            incoming,
          );
        },
      })),
    ),
  );
  const questionsQuery = reactive(
    useQuery<HumanQuestion[]>(
      computed(() => ({
        queryKey: questionQueryKeys.session(toValue(sessionId)),
        queryFn: async () => {
          const incoming = await listQuestions(toValue(sessionId));
          return mergeQuestions(
            queryClient.getQueryData<HumanQuestion[]>(
              questionQueryKeys.session(toValue(sessionId)),
            ),
            incoming,
          );
        },
      })),
    ),
  );
  const usableModels = computed(() =>
    usableModelsFrom(connectionsQuery.data ?? []),
  );
  const selectedModel = computed(() =>
    usableModels.value.find(
      ({ connection, entry }) =>
        connection.id === modelSelection.value?.connectionId &&
        entry.model_id === modelSelection.value.modelId,
    ),
  );
  watchMounted(
    [
      () => connectionsQuery.data,
      () => modelSelection.value,
      () => agentTurnsQuery.data,
      () => toValue(sessionId),
      () => setModelSelection.value,
      () => usableModels.value,
    ],
    () => {
      if (
        modelSelection.value !== undefined ||
        connectionsQuery.data === undefined ||
        agentTurnsQuery.data === undefined
      ) {
        return;
      }
      const latestTurn = agentTurnsQuery.data.at(-1);
      if (latestTurn !== undefined) {
        setModelSelection.value(toValue(sessionId), {
          connectionId: latestTurn.model_snapshot.connection_id,
          modelId: latestTurn.model_snapshot.model_id,
          reasoningEffort: latestTurn.model_snapshot.reasoning_effort,
        });
        return;
      }
      const defaultConnection = connectionsQuery.data.find(
        (item) => item.is_default,
      );
      if (
        defaultConnection === undefined ||
        defaultConnection.default_model_id === null
      ) {
        return;
      }
      const model = usableModels.value.find(
        ({ connection, entry }) =>
          connection.id === defaultConnection.id &&
          entry.model_id === defaultConnection.default_model_id,
      );
      if (model !== undefined) {
        setModelSelection.value(toValue(sessionId), {
          connectionId: model.connection.id,
          modelId: model.entry.model_id,
          reasoningEffort: model.entry.reasoning_default,
        });
      }
    },
  );
  useMessageSynchronization(
    () => toValue(sessionId),
    () => events.value,
    () => messagesQuery,
  );
  const mutation = reactive(
    useMutation({
      mutationFn: (submission: FrozenSubmission) =>
        appendUserMessage(
          toValue(sessionId),
          submission.idempotencyKey,
          submission,
        ),
      onSuccess: (accepted) => {
        queryClient.setQueryData<SessionMessage[]>(
          queryKey.value,
          (current) => {
            if (current === undefined) return [accepted.message];
            if (current.some((item) => item.id === accepted.message.id))
              return current;
            return [...current, accepted.message].sort(
              (left, right) => left.sequence - right.sequence,
            );
          },
        );
        const turn = accepted.turn;
        if (turn !== null) {
          queryClient.setQueryData<AgentTurn[]>(
            agentQueryKeys.session(toValue(sessionId)),
            (current) => mergeAgentTurns(current, [turn]),
          );
        }
        frozenSubmissionRef.value = null;
        setRequestFrozen(false);
        clearComposerDraft.value(toValue(sessionId));
      },
      onError: (error) => {
        console.error("[messages] Failed to send message.", {
          sessionId: toValue(sessionId),
          code: error instanceof ApiError ? error.code : null,
          error,
        });
        if (error instanceof ApiError && error.status < 500) {
          frozenSubmissionRef.value = null;
          setRequestFrozen(false);
        } else {
          setRequestFrozen(true);
        }
      },
    }),
  );
  function sendMessage(delivery?: "followup" | "steer" | "queue") {
    if (mutation.isPending) return;
    const frozen = frozenSubmissionRef.value;
    if (frozen !== null) {
      mutation.mutate(frozen);
      return;
    }
    if (
      (!draft.value.trim() && attachmentState.attachments.length === 0) ||
      attachmentState.blocked() ||
      attachmentState.attachments.reduce((sum, ref) => sum + ref.bytes, 0) >
        32 * 1024 * 1024 ||
      selectedModel.value === undefined
    )
      return;
    const submission: FrozenSubmission = {
      idempotencyKey: crypto.randomUUID(),
      content: quotedMessage(draft.value, quote.value),
      attachmentIds: attachmentState.attachments.map((ref) => ref.id),
      delivery:
        delivery ??
        (queuedDraft.value
          ? "followup"
          : agentTurnsQuery.data?.some(
                (turn) =>
                  !["completed", "failed", "cancelled"].includes(turn.state),
              )
            ? "steer"
            : "followup"),
      connectionId: selectedModel.value.connection.id,
      modelId: selectedModel.value.entry.model_id,
      reasoningEffort: modelSelection.value?.reasoningEffort ?? null,
      mapContext: mapContext.value,
    };
    frozenSubmissionRef.value = submission;
    setRequestFrozen(true);
    mutation.mutate(submission);
  }
  return shallowReactive({
    get draft() {
      return draft.value;
    },
    get quote() {
      return quote.value;
    },
    get quotedDraft() {
      return quotedMessage(draft.value, quote.value);
    },
    get changeQuote() {
      return (next: ReplyQuote | null) => {
        if (requestFrozen.value || mutation.isPending) return;
        if (
          next !== null &&
          !messagesQuery.data?.some(
            (message) =>
              message.id === next.messageId &&
              message.session_id === toValue(sessionId),
          )
        )
          throw new Error(
            "The reply source does not belong to this conversation.",
          );
        mutation.reset();
        setComposerQuote.value(toValue(sessionId), next);
      };
    },
    get attachmentState() {
      return attachmentState;
    },
    get queuedDraft() {
      return queuedDraft.value;
    },
    get mapContext() {
      return mapContext.value;
    },
    get messagesQuery() {
      return messagesQuery;
    },
    get connectionsQuery() {
      return connectionsQuery;
    },
    get agentTurnsQuery() {
      return agentTurnsQuery;
    },
    get confirmationsQuery() {
      return confirmationsQuery;
    },
    get questionsQuery() {
      return questionsQuery;
    },
    get mutation() {
      return mutation;
    },
    get requestFrozen() {
      return requestFrozen.value;
    },
    get usableModels() {
      return usableModels.value;
    },
    get selectedModel() {
      return selectedModel.value;
    },
    get modelSelection() {
      return modelSelection.value;
    },
    get sendError() {
      return mutation.isError
        ? messageSendError(mutation.error, requestFrozen.value)
        : null;
    },
    get changeDraft() {
      return (value: string) => {
        if (requestFrozen.value) return;
        mutation.reset();
        setComposerDraft.value(toValue(sessionId), value);
      };
    },
    get restoreDraft() {
      return (queued: QueuedAgentDraft) => {
        if (
          requestFrozen.value ||
          mutation.isPending ||
          attachmentState.blocked()
        )
          throw new Error("The composer already has an unresolved submission.");
        if (
          queued.turn === null ||
          queued.map_context.workspace_id !== toValue(workspaceId)
        )
          throw new Error(
            "Queued draft context does not belong to this workspace.",
          );
        const model = queued.turn.model_snapshot;
        mutation.reset();
        restoreComposerDraft.value(
          toValue(sessionId),
          queued.content,
          {
            connectionId: model.connection_id,
            modelId: model.model_id,
            reasoningEffort: model.reasoning_effort,
          },
          queued.attachments,
        );
        useAppUiStore().initializeMapContext(
          toValue(sessionId),
          toValue(workspaceId),
        );
        useAppUiStore().setMapSelection(
          toValue(sessionId),
          queued.map_context.selection,
        );
      };
    },
    get changeModel() {
      return (value: string) => {
        if (requestFrozen.value) return;
        const model = usableModels.value.find(
          ({ connection, entry }) =>
            `${connection.id}\n${entry.model_id}` === value,
        );
        if (model === undefined) return;
        mutation.reset();
        setModelSelection.value(toValue(sessionId), {
          connectionId: model.connection.id,
          modelId: model.entry.model_id,
          reasoningEffort: model.entry.reasoning_default,
        });
      };
    },
    get changeReasoningEffort() {
      return (value: string) => {
        if (requestFrozen.value || selectedModel.value === undefined) return;
        const reasoningEffort = value === "" ? null : value;
        if (
          reasoningEffort !== null &&
          !selectedModel.value.entry.reasoning_efforts.includes(reasoningEffort)
        ) {
          return;
        }
        mutation.reset();
        setModelSelection.value(toValue(sessionId), {
          connectionId: selectedModel.value.connection.id,
          modelId: selectedModel.value.entry.model_id,
          reasoningEffort,
        });
      };
    },
    get sendMessage() {
      return sendMessage;
    },
  });
}
function messageSendError(error: unknown, requestFrozen: boolean): string {
  if (requestFrozen) return zhCN.conversation.errors.retryFrozen;
  if (!(error instanceof ApiError)) return zhCN.conversation.errors.network;
  const messages: Readonly<Record<string, string>> =
    zhCN.conversation.errors.byCode;
  return error.code === null
    ? zhCN.conversation.errors.requestFailed(error.status)
    : (messages[error.code] ??
        zhCN.conversation.errors.requestFailed(error.status));
}
