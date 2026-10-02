import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { messageQueryKeys } from "@/features/messages/api";
import { cancelAgent, agentQueryKeys } from "@/features/agent/api";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { ConversationComposer } from "./ConversationComposer";
import { QueuedMessages } from "./QueuedMessages";
import { type ComposerModelGroup, type ModelPickerPane } from "./composer/ComposerModelPicker";
import { useComposerCommands } from "./composer/useComposerCommands";
import { useSessionMessages } from "./SessionMessagesContext";

export function SessionComposer() {
  const queryClient = useQueryClient();
  const [modelPickerPane, setModelPickerPane] = useState<ModelPickerPane | null>(null);
  const [queueEditing, setQueueEditing] = useState(false);
  const {
    draft,
    mapContext,
    changeDraft,
    changeModel,
    changeReasoningEffort,
    sendMessage,
    messagesQuery,
    connectionsQuery,
    agentTurnsQuery,
    mutation,
    requestFrozen,
    usableModels,
    selectedModel,
    modelSelection,
    sendError
  } = useSessionMessages();
  const session = useSessionWorkspace();
  const activeTurn = agentTurnsQuery.data?.find((turn) =>
    !["completed", "failed", "cancelled"].includes(turn.state)
  );
  const stopMutation = useMutation({
    mutationFn: () => {
      if (activeTurn === undefined) throw new Error("An active Agent turn is required.");
      return cancelAgent(session.id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: agentQueryKeys.session(session.id) }),
        queryClient.invalidateQueries({ queryKey: messageQueryKeys.session(session.id) })
      ]);
    },
    onError: (error) => {
      console.error("[agent] Failed to stop the active turn from composer.", {
        turnId: activeTurn?.id,
        error
      });
    }
  });
  const modelGroups = useMemo<ComposerModelGroup[]>(() => {
    const groups = new Map<string, ComposerModelGroup>();
    for (const { connection, entry } of usableModels) {
      const option = {
        value: `${connection.id}\n${entry.model_id}`,
        label: entry.display_name === null ? entry.model_id : entry.display_name,
        modelId: entry.model_id,
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

  const modelDisabled = mutation.isPending || requestFrozen || activeTurn !== undefined || connectionsQuery.isPending;
  const reasoningSelectionInvalid = selectedModel !== undefined && modelSelection?.reasoningEffort !== null && modelSelection?.reasoningEffort !== undefined && !selectedModel.entry.reasoning_efforts.includes(modelSelection.reasoningEffort);
  const sendDisabled = selectedModel === undefined || reasoningSelectionInvalid || agentTurnsQuery.data === undefined;
  const commandState = useComposerCommands({
    draft,
    locked: mutation.isPending || requestFrozen || queueEditing,
    modelDisabled,
    agentBusy: activeTurn !== undefined,
    sendDisabled,
    sendSkill: sendMessage,
    message: selectedModel === undefined ? null : {
      content: draft,
      delivery: activeTurn === undefined ? "followup" : "steer",
      connectionId: selectedModel.connection.id,
      modelId: selectedModel.entry.model_id,
      reasoningEffort: modelSelection?.reasoningEffort ?? null,
      mapContext,
    },
    changeDraft,
    openModelPicker: setModelPickerPane,
  });

  if (session.archived) {
    return (
      <p className="px-6 py-3 text-sm text-muted-foreground">
        {zhCN.archivedSessions.readOnly}
      </p>
    );
  }
  if (messagesQuery.data === undefined) return null;

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
            : agentTurnsQuery.isError
              ? zhCN.conversation.runsLoadFailed
              : stopMutation.isError
                ? zhCN.conversation.runActionFailed
                : null
  );
  const { latitude, longitude, zoom } = mapContext.viewport;

  return (
    <>
    <QueuedMessages onDraftLockChange={setQueueEditing} />
    <ConversationComposer
      contextLabel={zhCN.conversation.mapViewport(
        longitude.toFixed(4),
        latitude.toFixed(4),
        zoom.toFixed(1)
      )}
      draft={draft}
      onDraftChange={(value) => {
        commandState.resetFeedback();
        changeDraft(value);
      }}
      commands={commandState.commands}
      commandCatalogPending={commandState.catalogPending}
      commandCatalogError={commandState.catalogError}
      commandPending={commandState.pending}
      commandFeedback={commandState.feedback}
      onCommand={commandState.execute}
      modelPickerPane={modelPickerPane}
      onModelPickerPaneChange={setModelPickerPane}
      onSubmit={() => sendMessage()}
      onQueue={() => sendMessage("queue")}
      pending={mutation.isPending}
      interactionLocked={queueEditing}
      running={
        activeTurn !== undefined &&
        activeTurn.state !== "interrupted" &&
        !(activeTurn.state === "ready" && activeTurn.requires_resume)
      }
      stopPending={stopMutation.isPending}
      draftFrozen={requestFrozen}
      error={error}
      modelGroups={modelGroups}
      selectedModel={selectedValue}
      modelDisabled={modelDisabled}
      reasoningOptions={selectedModel?.entry.reasoning_efforts ?? []}
      defaultReasoningEffort={selectedModel?.entry.reasoning_default ?? null}
      selectedReasoningEffort={modelSelection?.reasoningEffort ?? ""}
      sendDisabled={
        requestFrozen
          ? false
          : selectedModel === undefined ||
            reasoningSelectionInvalid ||
            agentTurnsQuery.data === undefined
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
    </>
  );
}
