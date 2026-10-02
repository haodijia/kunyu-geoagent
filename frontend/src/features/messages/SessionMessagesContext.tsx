import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/api/client";
import { useAppUiStore } from "@/app/store";
import {
  confirmationQueryKeys,
  listConfirmations,
  mergeConfirmationSnapshots,
  type Confirmation
} from "@/features/confirmations/api";
import type { SessionEvent } from "@/features/events/api";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import {
  listAgentTurns,
  mergeAgentTurns,
  agentQueryKeys,
  type AgentTurn
} from "@/features/agent/api";
import { createMapContext } from "@/features/sessions/map-context";
import { modelConnectionsApi } from "@/features/settings/models/api";
import type {
  ModelCatalogEntry,
  ModelConnection
} from "@/features/settings/models/api";
import { zhCN } from "@/locales/zh-CN";
import {
  appendUserMessage,
  listMessages,
  messageQueryKeys,
  type SessionMessage
} from "./api";
import {
  applyMessageEvent,
  isMessageEvent,
  mergeMessageSnapshots
} from "./message-event-cache";

const MAX_PENDING_MESSAGE_EVENTS = 256;
const TERMINAL_RUN_EVENTS = new Set([
  "run.completed",
  "run.failed",
  "run.cancelled",
  "run.interrupted"
]);

export interface UsableModel {
  readonly connection: ModelConnection;
  readonly entry: ModelCatalogEntry;
}

interface FrozenSubmission {
  readonly idempotencyKey: string;
  readonly content: string;
  readonly delivery: "followup" | "steer" | "queue";
  readonly connectionId: string;
  readonly modelId: string;
  readonly reasoningEffort: string | null;
  readonly mapContext: ReturnType<typeof createMapContext>;
}

function useMessages(sessionId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const draft = useAppUiStore((state) => state.composerDraftBySession[sessionId] ?? "");
  const mapContext = useAppUiStore(
    (state) => state.mapContextBySession[sessionId] ?? createMapContext(workspaceId)
  );
  const modelSelection = useAppUiStore(
    (state) => state.modelSelectionBySession[sessionId]
  );
  const clearComposerDraft = useAppUiStore((state) => state.clearComposerDraft);
  const setComposerDraft = useAppUiStore((state) => state.setComposerDraft);
  const setModelSelection = useAppUiStore((state) => state.setModelSelection);
  const { events } = useSessionEvents();
  const queryKey = useMemo(() => messageQueryKeys.session(sessionId), [sessionId]);
  const seenSequenceRef = useRef(0);
  const pendingMessageEventsRef = useRef<SessionEvent[]>([]);
  const snapshotRequiredSequenceRef = useRef(0);
  const lastSnapshotRequestSequenceRef = useRef(0);
  const snapshotRequestPendingRef = useRef(false);
  const frozenSubmissionRef = useRef<FrozenSubmission | null>(null);
  const [requestFrozen, setRequestFrozen] = useState(false);
  const [reconcileRevision, setReconcileRevision] = useState(0);

  const messagesQuery = useQuery<SessionMessage[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const incoming = await listMessages(sessionId, signal);
      return mergeMessageSnapshots(
        queryClient.getQueryData<SessionMessage[]>(queryKey),
        incoming
      );
    }
  });
  const connectionsQuery = useQuery({
    queryKey: ["model-connections"],
    queryFn: modelConnectionsApi.list
  });
  const agentTurnsQuery = useQuery<AgentTurn[]>({
    queryKey: agentQueryKeys.session(sessionId),
    queryFn: async () => {
      const incoming = await listAgentTurns(sessionId);
      return mergeAgentTurns(
        queryClient.getQueryData<AgentTurn[]>(agentQueryKeys.session(sessionId)),
        incoming
      );
    }
  });
  const confirmationsQuery = useQuery<Confirmation[]>({
    queryKey: confirmationQueryKeys.session(sessionId),
    queryFn: async () => {
      const incoming = await listConfirmations(sessionId);
      return mergeConfirmationSnapshots(
        queryClient.getQueryData<Confirmation[]>(
          confirmationQueryKeys.session(sessionId)
        ),
        incoming
      );
    }
  });

  const usableModels = useMemo(
    () => usableModelsFrom(connectionsQuery.data ?? []),
    [connectionsQuery.data]
  );
  const selectedModel = usableModels.find(
    ({ connection, entry }) =>
      connection.id === modelSelection?.connectionId &&
      entry.model_id === modelSelection.modelId
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
        reasoningEffort: latestTurn.model_snapshot.reasoning_effort
      });
      return;
    }
    const defaultConnection = connectionsQuery.data.find((item) => item.is_default);
    if (defaultConnection === undefined || defaultConnection.default_model_id === null) {
      return;
    }
    const model = usableModels.find(
      ({ connection, entry }) =>
        connection.id === defaultConnection.id &&
        entry.model_id === defaultConnection.default_model_id
    );
    if (model !== undefined) {
      setModelSelection(sessionId, {
        connectionId: model.connection.id,
        modelId: model.entry.model_id,
        reasoningEffort: model.entry.reasoning_default
      });
    }
  }, [
    connectionsQuery.data,
    modelSelection,
    agentTurnsQuery.data,
    sessionId,
    setModelSelection,
    usableModels
  ]);

  useEffect(() => {
    let needsMessageSnapshot = false;
    let refreshAgentTurns = false;
    let refreshConfirmations = false;

    for (const event of events) {
      if (event.sequence <= seenSequenceRef.current) continue;
      if (event.sequence !== seenSequenceRef.current + 1) {
        needsMessageSnapshot = true;
      }
      seenSequenceRef.current = event.sequence;
      if (isMessageEvent(event)) {
        if (pendingMessageEventsRef.current.length >= MAX_PENDING_MESSAGE_EVENTS) {
          pendingMessageEventsRef.current = [];
          needsMessageSnapshot = true;
        }
        pendingMessageEventsRef.current.push(event);
      }
      refreshAgentTurns ||=
        event.event_type.startsWith("run.") ||
        event.event_type.startsWith("tool.") ||
        event.event_type.startsWith("confirmation.");
      refreshConfirmations ||=
        event.event_type === "confirmation.requested" ||
        event.event_type === "confirmation.resolved";
      needsMessageSnapshot ||= TERMINAL_RUN_EVENTS.has(event.event_type) || event.event_type === "agent/inbox/spliced";
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
        seenSequenceRef.current
      );
    }
    if (
      !snapshotRequestPendingRef.current &&
      lastSnapshotRequestSequenceRef.current < snapshotRequiredSequenceRef.current
    ) {
      snapshotRequestPendingRef.current = true;
      lastSnapshotRequestSequenceRef.current = snapshotRequiredSequenceRef.current;
      void messagesQuery.refetch({ cancelRefetch: true }).finally(() => {
        snapshotRequestPendingRef.current = false;
        setReconcileRevision((current) => current + 1);
      });
    }
    if (refreshAgentTurns) {
      void queryClient.invalidateQueries({ queryKey: agentQueryKeys.session(sessionId) });
    }
    if (refreshConfirmations) {
      void queryClient.invalidateQueries({
        queryKey: confirmationQueryKeys.session(sessionId)
      });
    }
  }, [
    events,
    messagesQuery.data,
    messagesQuery.refetch,
    queryClient,
    queryKey,
    reconcileRevision,
    sessionId
  ]);

  const mutation = useMutation({
    mutationFn: (submission: FrozenSubmission) =>
      appendUserMessage(sessionId, submission.idempotencyKey, submission),
    onSuccess: (accepted) => {
      queryClient.setQueryData<SessionMessage[]>(queryKey, (current) => {
        if (current === undefined) return [accepted.message];
        if (current.some((item) => item.id === accepted.message.id)) return current;
        return [...current, accepted.message].sort(
          (left, right) => left.sequence - right.sequence
        );
      });
      const turn = accepted.turn;
      if (turn !== null) {
        queryClient.setQueryData<AgentTurn[]>(
          agentQueryKeys.session(sessionId),
          (current) => mergeAgentTurns(current, [turn])
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
        error
      });
      if (error instanceof ApiError && error.status < 500) {
        frozenSubmissionRef.current = null;
        setRequestFrozen(false);
      } else {
        setRequestFrozen(true);
      }
    }
  });

  function sendMessage(delivery?: "followup" | "steer" | "queue") {
    if (mutation.isPending) return;
    const frozen = frozenSubmissionRef.current;
    if (frozen !== null) {
      mutation.mutate(frozen);
      return;
    }
    if (!draft.trim() || selectedModel === undefined) return;
    const submission: FrozenSubmission = {
      idempotencyKey: crypto.randomUUID(),
      content: draft,
      delivery: delivery ?? (agentTurnsQuery.data?.some(
        (turn) => !["completed", "failed", "cancelled"].includes(turn.state)
      )
        ? "steer"
        : "followup"),
      connectionId: selectedModel.connection.id,
      modelId: selectedModel.entry.model_id,
      reasoningEffort: modelSelection?.reasoningEffort ?? null,
      mapContext
    };
    frozenSubmissionRef.current = submission;
    setRequestFrozen(true);
    mutation.mutate(submission);
  }

  return {
    draft,
    mapContext,
    messagesQuery,
    connectionsQuery,
    agentTurnsQuery,
    confirmationsQuery,
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
    changeModel: (value: string) => {
      if (requestFrozen) return;
      const model = usableModels.find(
        ({ connection, entry }) => `${connection.id}\n${entry.model_id}` === value
      );
      if (model === undefined) return;
      mutation.reset();
      setModelSelection(sessionId, {
        connectionId: model.connection.id,
        modelId: model.entry.model_id,
        reasoningEffort: model.entry.reasoning_default
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
        reasoningEffort
      });
    },
    sendMessage
  };
}

const Context = createContext<ReturnType<typeof useMessages> | null>(null);

export function SessionMessagesProvider({
  sessionId,
  workspaceId,
  children
}: {
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly children: ReactNode;
}) {
  const state = useMessages(sessionId, workspaceId);
  return <Context value={state}>{children}</Context>;
}

export function useSessionMessages() {
  const state = useContext(Context);
  if (state === null) throw new Error("SessionMessagesProvider is required.");
  return state;
}

function usableModelsFrom(connections: readonly ModelConnection[]): UsableModel[] {
  return connections.flatMap((connection) =>
    connection.enabled && connection.credential.status === "ready"
      ? connection.entries
          .filter(
            (entry) =>
              entry.enabled &&
              entry.revision === connection.revision &&
              entry.availability === "available" &&
              entry.checks.text.status === "passed" &&
              entry.checks.tools.status === "passed"
          )
          .map((entry) => ({ connection, entry }))
      : []
  );
}

function messageSendError(error: unknown, requestFrozen: boolean): string {
  if (requestFrozen) return zhCN.conversation.errors.retryFrozen;
  if (!(error instanceof ApiError)) return zhCN.conversation.errors.network;
  const messages: Readonly<Record<string, string>> = zhCN.conversation.errors.byCode;
  return error.code === null
    ? zhCN.conversation.errors.requestFailed(error.status)
    : messages[error.code] ?? zhCN.conversation.errors.requestFailed(error.status);
}
