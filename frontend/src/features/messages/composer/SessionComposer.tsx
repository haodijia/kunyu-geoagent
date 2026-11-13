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
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, defineComponent, reactive, shallowRef, toRefs } from "vue";
export const SessionComposer = defineComponent(
  (_props, { slots: _slots }) => {
    const queryClient = useQueryClient();
    const { records, activeAssistant } = toRefs(useSessionEvents());
    const contextUsage = computed(() =>
      projectContextUsage(records.value, activeAssistant.value),
    );
    const modelPickerPane = shallowRef<ModelPickerPane | null>(null),
      setModelPickerPane = refSetter(modelPickerPane);
    const queueEditing = shallowRef(false),
      setQueueEditing = refSetter(queueEditing);
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
      sendError,
    } = toRefs(useSessionMessages());
    const session = useSessionWorkspace();
    const activeTurn = computed(() =>
      agentTurnsQuery.value.data?.find(
        (turn) => !["completed", "failed", "cancelled"].includes(turn.state),
      ),
    );
    const stopMutation = reactive(
      useMutation({
        mutationFn: () => {
          if (activeTurn.value === undefined)
            throw new Error("An active Agent turn is required.");
          return cancelAgent(session.id);
        },
        onSuccess: async () => {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: agentQueryKeys.session(session.id),
            }),
            queryClient.invalidateQueries({
              queryKey: messageQueryKeys.session(session.id),
            }),
          ]);
        },
        onError: (error) => {
          console.error(
            "[agent] Failed to stop the active turn from composer.",
            {
              turnId: activeTurn.value?.id,
              error,
            },
          );
        },
      }),
    );
    const modelGroups = computed<ComposerModelGroup[]>(() => {
      const groups = new Map<string, ComposerModelGroup>();
      for (const { connection, entry } of usableModels.value) {
        const option = {
          value: `${connection.id}\n${entry.model_id}`,
          label:
            entry.display_name === null ? entry.model_id : entry.display_name,
          modelId: entry.model_id,
        };
        const current = groups.get(connection.id);
        groups.set(connection.id, {
          id: connection.id,
          label: connection.display_name,
          options:
            current === undefined ? [option] : [...current.options, option],
        });
      }
      return [...groups.values()];
    });
    const modelDisabled = computed(
      () =>
        mutation.value.isPending ||
        requestFrozen.value ||
        queueEditing.value ||
        activeTurn.value !== undefined ||
        connectionsQuery.value.isPending,
    );
    const reasoningSelectionInvalid = computed(
      () =>
        selectedModel.value !== undefined &&
        modelSelection.value?.reasoningEffort !== null &&
        modelSelection.value?.reasoningEffort !== undefined &&
        !selectedModel.value.entry.reasoning_efforts.includes(
          modelSelection.value.reasoningEffort,
        ),
    );
    const imageUnsupported = computed(
      () =>
        attachmentState.value.attachments.some((ref) => ref.kind === "image") &&
        !(activeTurn.value === undefined || queuedDraft.value
          ? selectedModel.value?.entry.image_input.enabled
          : activeTurn.value.model_snapshot.image_input.enabled),
    );
    const sendDisabled = computed(
      () =>
        imageUnsupported.value ||
        selectedModel.value === undefined ||
        reasoningSelectionInvalid.value ||
        agentTurnsQuery.value.data === undefined,
    );
    const commandState = useComposerCommands(() => ({
      draft: draft.value,
      locked:
        mutation.value.isPending ||
        requestFrozen.value ||
        queueEditing.value ||
        attachmentState.value.pending ||
        attachmentState.value.retryAvailable,
      modelDisabled: modelDisabled.value,
      agentBusy: activeTurn.value !== undefined,
      sendDisabled: sendDisabled.value,
      sendSkill: sendMessage.value,
      message:
        selectedModel.value === undefined
          ? null
          : {
              content: quotedDraft.value,
              attachmentIds: attachmentState.value.attachments.map(
                (ref) => ref.id,
              ),
              delivery:
                activeTurn.value === undefined || queuedDraft.value
                  ? "followup"
                  : "steer",
              connectionId: selectedModel.value.connection.id,
              modelId: selectedModel.value.entry.model_id,
              reasoningEffort: modelSelection.value?.reasoningEffort ?? null,
              mapContext: mapContext.value,
            },
      changeDraft: changeDraft.value,
      openModelPicker: setModelPickerPane,
    }));
    const selectedValue = computed(() =>
      selectedModel.value === undefined
        ? ""
        : `${selectedModel.value.connection.id}\n${selectedModel.value.entry.model_id}`,
    );
    const error = computed(
      () =>
        sendError.value ??
        (connectionsQuery.value.isError
          ? zhCN.conversation.modelsLoadFailed
          : usableModels.value.length === 0
            ? zhCN.conversation.noVerifiedModels
            : selectedModel.value === undefined
              ? zhCN.conversation.selectModelRequired
              : reasoningSelectionInvalid.value
                ? zhCN.conversation.reasoningSelectionInvalid
                : agentTurnsQuery.value.isError
                  ? zhCN.conversation.runsLoadFailed
                  : stopMutation.isError
                    ? zhCN.conversation.runActionFailed
                    : null),
    );
    return () => {
      const _activeTurn = activeTurn.value,
        _contextUsage = contextUsage.value,
        _imageUnsupported = imageUnsupported.value,
        _error = error.value,
        _modelGroups = modelGroups.value,
        _selectedValue = selectedValue.value,
        _modelDisabled = modelDisabled.value,
        _reasoningSelectionInvalid = reasoningSelectionInvalid.value;
      if (session.archived) {
        return (
          <p class="px-6 py-3 text-sm text-muted-foreground">
            {zhCN.archivedSessions.readonly}
          </p>
        );
      }
      if (messagesQuery.value.data === undefined) return null;
      return (
        <>
          <QueuedMessages onDraftLockChange={setQueueEditing} />
          <ConversationPlanBar
            runId={_activeTurn?.id ?? null}
            processing={
              _activeTurn !== undefined &&
              _activeTurn.state !== "interrupted" &&
              !(_activeTurn.state === "ready" && _activeTurn.requires_resume)
            }
          />
          {_activeTurn?.state === "waiting_input" ? (
            <QuestionComposer
              turn={_activeTurn}
              onCancel={() => stopMutation.mutate()}
              cancelPending={stopMutation.isPending}
              cancelError={
                stopMutation.isError ? zhCN.conversation.runActionFailed : null
              }
            />
          ) : (
            <ConversationComposer
              sessionId={session.id}
              workspaceId={session.workspace_id}
              contextUsage={_contextUsage}
              attachmentState={attachmentState.value}
              mapViewport={mapContext.value.viewport}
              mapSelection={mapContext.value.selection}
              onMapSelectionClear={() =>
                useAppUiStore().setMapSelection(session.id, null)
              }
              draft={draft.value}
              quote={quote.value}
              onQuoteClear={() => changeQuote.value(null)}
              queuedDraft={queuedDraft.value}
              onDraftChange={(value) => {
                commandState.resetFeedback();
                changeDraft.value(value);
              }}
              commands={commandState.commands}
              commandCatalogPending={commandState.catalogPending}
              commandCatalogError={commandState.catalogError}
              commandPending={commandState.pending}
              commandFeedback={commandState.feedback}
              onCommand={commandState.execute}
              onExitPlan={() =>
                void commandState.execute("/plan off", {
                  preserveDraft: true,
                })
              }
              modelPickerPane={modelPickerPane.value}
              onModelPickerPaneChange={setModelPickerPane}
              onSubmit={() => sendMessage.value()}
              pending={mutation.value.isPending}
              interactionLocked={queueEditing.value}
              running={
                _activeTurn !== undefined &&
                _activeTurn.state !== "interrupted" &&
                !(_activeTurn.state === "ready" && _activeTurn.requires_resume)
              }
              stopPending={stopMutation.isPending}
              draftFrozen={requestFrozen.value}
              error={
                _imageUnsupported
                  ? zhCN.conversation.imageModelRequired
                  : _error
              }
              modelGroups={_modelGroups}
              selectedModel={_selectedValue}
              modelDisabled={_modelDisabled}
              reasoningOptions={
                selectedModel.value?.entry.reasoning_efforts ?? []
              }
              defaultReasoningEffort={
                selectedModel.value?.entry.reasoning_default ?? null
              }
              selectedReasoningEffort={
                modelSelection.value?.reasoningEffort ?? ""
              }
              sendDisabled={
                requestFrozen.value
                  ? false
                  : _imageUnsupported ||
                    selectedModel.value === undefined ||
                    _reasoningSelectionInvalid ||
                    agentTurnsQuery.value.data === undefined
              }
              showModelSettings={
                !requestFrozen.value &&
                !connectionsQuery.value.isPending &&
                !connectionsQuery.value.isError &&
                (usableModels.value.length === 0 || _imageUnsupported)
              }
              onModelChange={changeModel.value}
              onReasoningEffortChange={changeReasoningEffort.value}
              onStop={() => stopMutation.mutate()}
            />
          )}
        </>
      );
    };
  },
  {
    name: "SessionComposer",
    inheritAttrs: false,
    props: [],
  },
);
