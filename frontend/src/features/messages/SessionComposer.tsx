import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { messageQueryKeys } from "@/features/messages/api";
import { cancelRun, runQueryKeys } from "@/features/runs/api";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import {
  ConversationComposer,
  type ComposerModelGroup
} from "./ConversationComposer";
import { useSessionMessages } from "./SessionMessagesContext";

interface SessionComposerProps {
  readonly compact?: boolean;
}

export function SessionComposer({ compact = false }: SessionComposerProps) {
  const queryClient = useQueryClient();
  const {
    draft,
    mapContext,
    changeDraft,
    changeModel,
    changeReasoningEffort,
    sendMessage,
    messagesQuery,
    connectionsQuery,
    runsQuery,
    mutation,
    requestFrozen,
    usableModels,
    selectedModel,
    modelSelection,
    sendError
  } = useSessionMessages();
  const session = useSessionWorkspace();
  const activeRun = runsQuery.data?.find((run) =>
    !["completed", "failed", "cancelled"].includes(run.state)
  );
  const stopMutation = useMutation({
    mutationFn: () => {
      if (activeRun === undefined) throw new Error("An active run is required.");
      return cancelRun(activeRun.id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: runQueryKeys.session(session.id) }),
        queryClient.invalidateQueries({ queryKey: messageQueryKeys.session(session.id) })
      ]);
    },
    onError: (error) => {
      console.error("[runs] Failed to stop run from composer.", {
        runId: activeRun?.id,
        error
      });
    }
  });
  const modelGroups = useMemo<ComposerModelGroup[]>(() => {
    const groups = new Map<string, ComposerModelGroup>();
    for (const { connection, entry } of usableModels) {
      const option = {
        value: `${connection.id}\n${entry.model_id}`,
        label: entry.display_name === null
          ? entry.model_id
          : `${entry.display_name} · ${entry.model_id}`
      };
      const current = groups.get(connection.id);
      groups.set(connection.id, {
        id: connection.id,
        label: connection.display_name,
        options: current === undefined ? [option] : [...current.options, option]
      });
    }
    return [...groups.values()];
  }, [usableModels]);

  if (session.archived) {
    return (
      <p className="px-6 py-3 text-sm text-muted-foreground">
        {zhCN.archivedSessions.readOnly}
      </p>
    );
  }
  if (messagesQuery.data === undefined) return null;

  const reasoningSelectionInvalid =
    selectedModel !== undefined &&
    modelSelection?.reasoningEffort !== null &&
    modelSelection?.reasoningEffort !== undefined &&
    !selectedModel.entry.reasoning_efforts.includes(modelSelection.reasoningEffort);
  const selectedValue = selectedModel === undefined
    ? ""
    : `${selectedModel.connection.id}\n${selectedModel.entry.model_id}`;
  const error = sendError ?? (
    connectionsQuery.isError
      ? zhCN.conversation.modelsLoadFailed
      : usableModels.length === 0
        ? zhCN.conversation.noVerifiedModels
        : selectedModel === undefined
          ? zhCN.conversation.selectModelRequired
          : reasoningSelectionInvalid
            ? zhCN.conversation.reasoningSelectionInvalid
            : runsQuery.isError
              ? zhCN.conversation.runsLoadFailed
              : stopMutation.isError
                ? zhCN.conversation.runActionFailed
                : null
  );
  const { latitude, longitude, zoom } = mapContext.viewport;

  return (
    <ConversationComposer
      compact={compact}
      contextLabel={zhCN.conversation.mapViewport(
        longitude.toFixed(4),
        latitude.toFixed(4),
        zoom.toFixed(1)
      )}
      draft={draft}
      onDraftChange={changeDraft}
      onSubmit={sendMessage}
      pending={mutation.isPending}
      running={
        activeRun !== undefined &&
        activeRun.state !== "interrupted" &&
        !(activeRun.state === "ready" && activeRun.requires_resume)
      }
      stopPending={stopMutation.isPending}
      draftFrozen={requestFrozen}
      error={error}
      modelGroups={modelGroups}
      selectedModel={selectedValue}
      modelDisabled={
        mutation.isPending ||
        requestFrozen ||
        activeRun !== undefined ||
        connectionsQuery.isPending
      }
      reasoningOptions={selectedModel?.entry.reasoning_efforts ?? []}
      selectedReasoningEffort={modelSelection?.reasoningEffort ?? ""}
      sendDisabled={
        requestFrozen
          ? false
          : selectedModel === undefined ||
            reasoningSelectionInvalid ||
            runsQuery.data === undefined ||
            activeRun !== undefined
      }
      showModelSettings={
        !requestFrozen &&
        !connectionsQuery.isPending &&
        !connectionsQuery.isError &&
        usableModels.length === 0
      }
      onModelChange={changeModel}
      onReasoningEffortChange={changeReasoningEffort}
      onStop={() => stopMutation.mutate()}
    />
  );
}
