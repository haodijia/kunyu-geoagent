import { TaskStatus } from "@/features/agent/controls/TaskStatus";
import { AnalysisContext } from "@/features/maps/conversation/AnalysisContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAppUiStore } from "@/app/store";

import { agentQueryKeys, cancelAgent } from "@/features/agent/api";
import { ConversationPlanBar } from "@/features/agent/plan/ConversationPlanBar";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { messageQueryKeys } from "@/features/messages/api";
import {
  type ComposerModelGroup,
  type ModelPickerPane,
} from "@/features/messages/composer/ComposerModelPicker";
import { projectContextUsage } from "@/features/messages/composer/context-usage";
import { ConversationComposer } from "@/features/messages/composer/ConversationComposer";
import { QueuedMessages } from "@/features/messages/composer/QueuedMessages";
import { useComposerCommands } from "@/features/messages/composer/useComposerCommands";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { QuestionComposer } from "@/features/questions/QuestionComposer";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";

export function SessionComposer() {
  const queryClient = useQueryClient();
  const { records, activeAssistant } = useSessionEvents();
  const contextUsage = useMemo(() => projectContextUsage(records, activeAssistant), [records, activeAssistant]);
  const [modelPickerPane, setModelPickerPane] = useState<ModelPickerPane | null>(null);
  const [queueEditing, setQueueEditing] = useState(false);
  const {
    draft,
    quote,
    quotedDraft,
    changeQuote,
    attachmentState,
    queuedDraft,
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

  const modelDisabled = mutation.isPending || requestFrozen || queueEditing || activeTurn !== undefined || connectionsQuery.isPending;
  const reasoningSelectionInvalid = selectedModel !== undefined && modelSelection?.reasoningEffort !== null && modelSelection?.reasoningEffort !== undefined && !selectedModel.entry.reasoning_efforts.includes(modelSelection.reasoningEffort);
  const imageUnsupported = attachmentState.attachments.some((ref) => ref.kind === "image")
    && !(activeTurn === undefined || queuedDraft
      ? selectedModel?.entry.image_input.enabled
      : activeTurn.model_snapshot.image_input.enabled);
  const sendDisabled = imageUnsupported || selectedModel === undefined || reasoningSelectionInvalid || agentTurnsQuery.data === undefined;
  const commandState = useComposerCommands({
    draft,
    locked: mutation.isPending || requestFrozen || queueEditing || attachmentState.pending || attachmentState.retryAvailable,
    modelDisabled,
    agentBusy: activeTurn !== undefined,
    sendDisabled,
    sendSkill: sendMessage,
    message: selectedModel === undefined ? null : {
      content: quotedDraft,
      attachmentIds: attachmentState.attachments.map((ref) => ref.id),
      delivery: activeTurn === undefined || queuedDraft ? "followup" : "steer",
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

  return (
    <>
    <AnalysisContext />
    <TaskStatus />
    <QueuedMessages onDraftLockChange={setQueueEditing} />
    <ConversationPlanBar
      runId={activeTurn?.id ?? null}
      processing={activeTurn !== undefined && activeTurn.state !== "interrupted" && !(activeTurn.state === "ready" && activeTurn.requires_resume)}
    />
    {activeTurn?.state === "waiting_input" ? <QuestionComposer turn={activeTurn} onCancel={() => stopMutation.mutate()} cancelPending={stopMutation.isPending} cancelError={stopMutation.isError ? zhCN.conversation.runActionFailed : null} /> : <ConversationComposer
      sessionId={session.id}
      workspaceId={session.workspace_id}
      contextUsage={contextUsage}
      attachmentState={attachmentState}
      mapViewport={mapContext.viewport}
      mapSelection={mapContext.selection}
      onMapSelectionClear={() => useAppUiStore.getState().setMapSelection(session.id, null)}
      draft={draft}
      quote={quote}
      onQuoteClear={() => changeQuote(null)}
      queuedDraft={queuedDraft}
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
      onExitPlan={() => void commandState.execute("/plan off", { preserveDraft: true })}
      modelPickerPane={modelPickerPane}
      onModelPickerPaneChange={setModelPickerPane}
      onSubmit={() => sendMessage()}
      pending={mutation.isPending}
      interactionLocked={queueEditing}
      running={
        activeTurn !== undefined &&
        activeTurn.state !== "interrupted" &&
        !(activeTurn.state === "ready" && activeTurn.requires_resume)
      }
      stopPending={stopMutation.isPending}
      draftFrozen={requestFrozen}
      error={imageUnsupported ? zhCN.conversation.imageModelRequired : error}
      modelGroups={modelGroups}
      selectedModel={selectedValue}
      modelDisabled={modelDisabled}
      reasoningOptions={selectedModel?.entry.reasoning_efforts ?? []}
      defaultReasoningEffort={selectedModel?.entry.reasoning_default ?? null}
      selectedReasoningEffort={modelSelection?.reasoningEffort ?? ""}
      sendDisabled={
        requestFrozen
          ? false
          : imageUnsupported || selectedModel === undefined ||
            reasoningSelectionInvalid ||
            agentTurnsQuery.data === undefined
      }
      showModelSettings={
        !requestFrozen &&
        !connectionsQuery.isPending &&
        !connectionsQuery.isError &&
        (usableModels.length === 0 || imageUnsupported)
      }
      onModelChange={changeModel}
      onReasoningEffortChange={changeReasoningEffort}
      onStop={() => stopMutation.mutate()}
    />}
    </>
  );
}
