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
import {
  createMapContext,
  mapContextFromSnapshot,
} from "@/features/sessions/map-context";
import { modelConnectionsApi } from "@/features/settings/models/api";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

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

export function useMessages(sessionId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const attachmentState = useComposerAttachments(sessionId);
  const draft = useAppUiStore(
    (state) => state.composerDraftBySession[sessionId] ?? "",
  );
  const queuedDraft = useAppUiStore(
    (state) => state.composerQueuedBySession[sessionId] === true,
  );
  const mapContext = useAppUiStore(
    (state) =>
      state.mapContextBySession[sessionId] ?? createMapContext(workspaceId),
  );
  const modelSelection = useAppUiStore(
    (state) => state.modelSelectionBySession[sessionId],
  );
  const clearComposerDraft = useAppUiStore((state) => state.clearComposerDraft);
  const setComposerDraft = useAppUiStore((state) => state.setComposerDraft);
  const quote = useAppUiStore(
    (state) => state.composerQuoteBySession[sessionId] ?? null,
  );
  const setComposerQuote = useAppUiStore((state) => state.setComposerQuote);
  const restoreComposerDraft = useAppUiStore(
    (state) => state.restoreComposerDraft,
  );
  const setModelSelection = useAppUiStore((state) => state.setModelSelection);
  const { events } = useSessionEvents();
  const queryKey = useMemo(
    () => messageQueryKeys.session(sessionId),
    [sessionId],
  );
  const frozenSubmissionRef = useRef<FrozenSubmission | null>(null);
  const [requestFrozen, setRequestFrozen] = useState(false);

  const messagesQuery = useQuery<SessionMessage[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const incoming = await listMessages(sessionId, signal);
      return mergeMessageSnapshots(
        queryClient.getQueryData<SessionMessage[]>(queryKey),
        incoming,
      );
    },
  });
  const connectionsQuery = useQuery({
    queryKey: ["model-connections"],
    queryFn: modelConnectionsApi.list,
  });
  const agentTurnsQuery = useQuery<AgentTurn[]>({
    queryKey: agentQueryKeys.session(sessionId),
    queryFn: async () => {
      const incoming = await listAgentTurns(sessionId);
      return mergeAgentTurns(
        queryClient.getQueryData<AgentTurn[]>(
          agentQueryKeys.session(sessionId),
        ),
        incoming,
      );
    },
  });
  const confirmationsQuery = useQuery<Confirmation[]>({
    queryKey: confirmationQueryKeys.session(sessionId),
    queryFn: async () => {
      const incoming = await listConfirmations(sessionId);
      return mergeConfirmationSnapshots(
        queryClient.getQueryData<Confirmation[]>(
          confirmationQueryKeys.session(sessionId),
        ),
        incoming,
      );
    },
  });

  const questionsQuery = useQuery<HumanQuestion[]>({
    queryKey: questionQueryKeys.session(sessionId),
    queryFn: async () => {
      const incoming = await listQuestions(sessionId);
      return mergeQuestions(
        queryClient.getQueryData<HumanQuestion[]>(
          questionQueryKeys.session(sessionId),
        ),
        incoming,
      );
    },
  });

  const usableModels = useMemo(
    () => usableModelsFrom(connectionsQuery.data ?? []),
    [connectionsQuery.data],
  );
  const selectedModel = usableModels.find(
    ({ connection, entry }) =>
      connection.id === modelSelection?.connectionId &&
      entry.model_id === modelSelection.modelId,
  );

  useEffect(() => {
    if (
      modelSelection !== undefined ||
      connectionsQuery.data === undefined ||
      agentTurnsQuery.data === undefined
    ) {
      return;
    }
    const latestTurn = agentTurnsQuery.data.at(-1);
    if (latestTurn !== undefined) {
      setModelSelection(sessionId, {
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
    const model = usableModels.find(
      ({ connection, entry }) =>
        connection.id === defaultConnection.id &&
        entry.model_id === defaultConnection.default_model_id,
    );
    if (model !== undefined) {
      setModelSelection(sessionId, {
        connectionId: model.connection.id,
        modelId: model.entry.model_id,
        reasoningEffort: model.entry.reasoning_default,
      });
    }
  }, [
    connectionsQuery.data,
    modelSelection,
    agentTurnsQuery.data,
    sessionId,
    setModelSelection,
    usableModels,
  ]);

  useMessageSynchronization(sessionId, events, messagesQuery);

  const mutation = useMutation({
    mutationFn: (submission: FrozenSubmission) =>
      appendUserMessage(sessionId, submission.idempotencyKey, submission),
    onSuccess: (accepted) => {
      queryClient.setQueryData<SessionMessage[]>(queryKey, (current) => {
        if (current === undefined) return [accepted.message];
        if (current.some((item) => item.id === accepted.message.id))
          return current;
        return [...current, accepted.message].sort(
          (left, right) => left.sequence - right.sequence,
        );
      });
      const turn = accepted.turn;
      if (turn !== null) {
        queryClient.setQueryData<AgentTurn[]>(
          agentQueryKeys.session(sessionId),
          (current) => mergeAgentTurns(current, [turn]),
        );
      }
      frozenSubmissionRef.current = null;
      setRequestFrozen(false);
      clearComposerDraft(sessionId);
    },
    onError: (error) => {
      console.error("[messages] Failed to send message.", {
        sessionId,
        code: error instanceof ApiError ? error.code : null,
        error,
      });
      if (error instanceof ApiError && error.status < 500) {
        frozenSubmissionRef.current = null;
        setRequestFrozen(false);
      } else {
        setRequestFrozen(true);
      }
    },
  });

  function sendMessage(delivery?: "followup" | "steer" | "queue") {
    if (mutation.isPending) return;
    const frozen = frozenSubmissionRef.current;
    if (frozen !== null) {
      mutation.mutate(frozen);
      return;
    }
    if (
      (!draft.trim() && attachmentState.attachments.length === 0) ||
      attachmentState.blocked() ||
      attachmentState.attachments.reduce((sum, ref) => sum + ref.bytes, 0) >
        32 * 1024 * 1024 ||
      selectedModel === undefined
    )
      return;
    const submission: FrozenSubmission = {
      idempotencyKey: crypto.randomUUID(),
      content: quotedMessage(draft, quote),
      attachmentIds: attachmentState.attachments.map((ref) => ref.id),
      delivery:
        delivery ??
        (queuedDraft
          ? "followup"
          : agentTurnsQuery.data?.some(
                (turn) =>
                  !["completed", "failed", "cancelled"].includes(turn.state),
              )
            ? "steer"
            : "followup"),
      connectionId: selectedModel.connection.id,
      modelId: selectedModel.entry.model_id,
      reasoningEffort: modelSelection?.reasoningEffort ?? null,
      mapContext,
    };
    frozenSubmissionRef.current = submission;
    setRequestFrozen(true);
    mutation.mutate(submission);
  }

  return {
    draft,
    quote,
    quotedDraft: quotedMessage(draft, quote),
    changeQuote: (next: ReplyQuote | null) => {
      if (requestFrozen || mutation.isPending) return;
      if (
        next !== null &&
        !messagesQuery.data?.some(
          (message) =>
            message.id === next.messageId && message.session_id === sessionId,
        )
      )
        throw new Error(
          "The reply source does not belong to this conversation.",
        );
      mutation.reset();
      setComposerQuote(sessionId, next);
    },
    attachmentState,
    queuedDraft,
    mapContext,
    messagesQuery,
    connectionsQuery,
    agentTurnsQuery,
    confirmationsQuery,
    questionsQuery,
    mutation,
    requestFrozen,
    usableModels,
    selectedModel,
    modelSelection,
    sendError: mutation.isError
      ? messageSendError(mutation.error, requestFrozen)
      : null,
    changeDraft: (value: string) => {
      if (requestFrozen) return;
      mutation.reset();
      setComposerDraft(sessionId, value);
    },
    restoreDraft: (queued: QueuedAgentDraft) => {
      if (requestFrozen || mutation.isPending || attachmentState.blocked())
        throw new Error("The composer already has an unresolved submission.");
      if (
        queued.turn === null ||
        queued.map_context.workspace_id !== workspaceId
      )
        throw new Error(
          "Queued draft context does not belong to this workspace.",
        );
      const model = queued.turn.model_snapshot;
      mutation.reset();
      restoreComposerDraft(
        sessionId,
        queued.content,
        mapContextFromSnapshot(queued.map_context),
        {
          connectionId: model.connection_id,
          modelId: model.model_id,
          reasoningEffort: model.reasoning_effort,
        },
        queued.attachments,
      );
    },
    changeModel: (value: string) => {
      if (requestFrozen) return;
      const model = usableModels.find(
        ({ connection, entry }) =>
          `${connection.id}\n${entry.model_id}` === value,
      );
      if (model === undefined) return;
      mutation.reset();
      setModelSelection(sessionId, {
        connectionId: model.connection.id,
        modelId: model.entry.model_id,
        reasoningEffort: model.entry.reasoning_default,
      });
    },
    changeReasoningEffort: (value: string) => {
      if (requestFrozen || selectedModel === undefined) return;
      const reasoningEffort = value === "" ? null : value;
      if (
        reasoningEffort !== null &&
        !selectedModel.entry.reasoning_efforts.includes(reasoningEffort)
      ) {
        return;
      }
      mutation.reset();
      setModelSelection(sessionId, {
        connectionId: selectedModel.connection.id,
        modelId: selectedModel.entry.model_id,
        reasoningEffort,
      });
    },
    sendMessage,
  };
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
