import { useMemo } from "react";

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
          : activeRun !== undefined
            ? zhCN.conversation.runInProgress
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
    />
  );
}
