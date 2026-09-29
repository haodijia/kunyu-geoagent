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
  listConfirmations
} from "@/features/confirmations/api";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { listRuns, runQueryKeys, type RunSnapshot } from "@/features/runs/api";
import { createMapContext } from "@/features/sessions/map-context";
import { modelConnectionsApi } from "@/features/settings/models/api";
import type {
  ModelCatalogEntry,
  ModelConnection
} from "@/features/settings/models/api";
import {
  appendUserMessage,
  listMessages,
  messageQueryKeys,
  type SessionMessage
} from "./api";
import { applyMessageEvent } from "./message-event-cache";

interface UsableModel {
  readonly connection: ModelConnection;
  readonly entry: ModelCatalogEntry;
}

interface FrozenSubmission {
  readonly idempotencyKey: string;
  readonly content: string;
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
  const processedSequenceRef = useRef(0);
  const frozenSubmissionRef = useRef<FrozenSubmission | null>(null);
  const [requestFrozen, setRequestFrozen] = useState(false);

  const messagesQuery = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await listMessages(sessionId);
      } catch (error) {
        console.error("[messages] Failed to load session messages.", {
          sessionId,
          error
        });
        throw error;
      }
    }
  });
  const connectionsQuery = useQuery({
    queryKey: ["model-connections"],
    queryFn: modelConnectionsApi.list
  });
  const runsQuery = useQuery({
    queryKey: runQueryKeys.session(sessionId),
    queryFn: () => listRuns(sessionId)
  });
  const confirmationsQuery = useQuery({
    queryKey: confirmationQueryKeys.session(sessionId),
    queryFn: () => listConfirmations(sessionId)
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
    if (modelSelection !== undefined || connectionsQuery.data === undefined) return;
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
        reasoningEffort: null
      });
    }
  }, [connectionsQuery.data, modelSelection, sessionId, setModelSelection, usableModels]);

  useEffect(() => {
    let current = queryClient.getQueryData<SessionMessage[]>(queryKey);
    if (current === undefined) return;
    let needsMessageSnapshot = false;
    let refreshRuns = false;
    let refreshConfirmations = false;

    for (const event of events) {
      if (event.sequence <= processedSequenceRef.current) continue;
      const merged = applyMessageEvent(current, event);
      current = merged.messages;
      needsMessageSnapshot ||= merged.needsSnapshot;
      refreshRuns ||= event.event_type.startsWith("run.");
      refreshConfirmations ||=
        event.event_type === "confirmation.requested" ||
        event.event_type === "confirmation.resolved";
      if (
        event.event_type === "run.failed" ||
        event.event_type === "run.cancelled" ||
        event.event_type === "run.interrupted"
      ) {
        needsMessageSnapshot = true;
      }
      processedSequenceRef.current = event.sequence;
    }

    queryClient.setQueryData(queryKey, current);
    if (needsMessageSnapshot) {
      void queryClient.invalidateQueries({ queryKey });
    }
    if (refreshRuns) {
      void queryClient.invalidateQueries({ queryKey: runQueryKeys.session(sessionId) });
    }
    if (refreshConfirmations) {
      void queryClient.invalidateQueries({
        queryKey: confirmationQueryKeys.session(sessionId)
      });
    }
  }, [events, messagesQuery.data, queryClient, queryKey, sessionId]);

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
      queryClient.setQueryData<RunSnapshot[]>(
        runQueryKeys.session(sessionId),
        (current) => {
          if (current === undefined) return [accepted.run];
          const retained = current.filter((item) => item.id !== accepted.run.id);
          return [...retained, accepted.run].sort((left, right) =>
            left.created_at.localeCompare(right.created_at)
          );
        }
      );
      frozenSubmissionRef.current = null;
      setRequestFrozen(false);
      clearComposerDraft(sessionId);
    },
    onError: (error) => {
      console.error("[messages] Failed to send message.", { sessionId, error });
      if (error instanceof ApiError && error.status < 500) {
        frozenSubmissionRef.current = null;
        setRequestFrozen(false);
      } else {
        setRequestFrozen(true);
      }
    }
  });

  function sendMessage() {
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
    messagesQuery,
    connectionsQuery,
    runsQuery,
    confirmationsQuery,
    mutation,
    requestFrozen,
    usableModels,
    selectedModel,
    modelSelection,
    changeDraft: (value: string) => {
      if (requestFrozen) return;
      mutation.reset();
      setComposerDraft(sessionId, value);
    },
    changeModel: (value: string) => {
      const model = usableModels.find(
        ({ connection, entry }) => `${connection.id}\n${entry.model_id}` === value
      );
      if (model === undefined) return;
      setModelSelection(sessionId, {
        connectionId: model.connection.id,
        modelId: model.entry.model_id,
        reasoningEffort: null
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
