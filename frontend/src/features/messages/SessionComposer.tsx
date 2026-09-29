import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { ConversationComposer } from "./ConversationComposer";
import { useSessionMessages } from "./SessionMessagesContext";
import { zhCN } from "@/locales/zh-CN";

interface SessionComposerProps {
  readonly compact?: boolean;
}

export function SessionComposer({ compact = false }: SessionComposerProps) {
  const {
    draft,
    changeDraft,
    changeModel,
    sendMessage,
    messagesQuery,
    connectionsQuery,
    runsQuery,
    mutation,
    requestFrozen,
    usableModels,
    selectedModel
  } = useSessionMessages();
  const session = useSessionWorkspace();
  if (session.archived) return <p className="px-6 py-3 text-sm text-muted-foreground">{zhCN.archivedSessions.readOnly}</p>;
  if (messagesQuery.data === undefined) return null;
  const activeRun = runsQuery.data?.find((run) =>
    !["completed", "failed", "cancelled"].includes(run.state)
  );
  const modelOptions = usableModels.map(({ connection, entry }) => ({
    value: `${connection.id}\n${entry.model_id}`,
    label: `${connection.display_name} · ${entry.display_name ?? entry.model_id}`
  }));
  const selectedValue = selectedModel === undefined
    ? ""
    : `${selectedModel.connection.id}\n${selectedModel.entry.model_id}`;
  const error = mutation.isError
    ? zhCN.conversation.sendFailed
    : connectionsQuery.isError
      ? zhCN.conversation.modelsLoadFailed
      : usableModels.length === 0
        ? zhCN.conversation.noVerifiedModels
        : selectedModel === undefined
          ? zhCN.conversation.selectModelRequired
          : activeRun !== undefined
            ? zhCN.conversation.runInProgress
            : null;
  return <ConversationComposer draft={draft} onDraftChange={changeDraft} onSubmit={sendMessage}
    compact={compact} pending={mutation.isPending} draftFrozen={requestFrozen}
    error={error} modelOptions={modelOptions} selectedModel={selectedValue}
    modelDisabled={mutation.isPending || requestFrozen || activeRun !== undefined}
    sendDisabled={selectedModel === undefined || activeRun !== undefined}
    onModelChange={changeModel} />;
}
