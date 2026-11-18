import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentStrip } from "@/features/attachments/AttachmentStrip";
import type { useComposerAttachments } from "@/features/attachments/useComposerAttachments";
import { MapLocationLabel } from "@/features/maps/conversation/MapLocationLabel";
import {
  ComposerModelPicker,
  type ComposerModelGroup,
  type ModelPickerPane,
} from "@/features/messages/composer/ComposerModelPicker";
import { ComposerPlanChip } from "@/features/messages/composer/ComposerPlanChip";
import { ComposerSuggestionMenu } from "@/features/messages/composer/ComposerSuggestionMenu";
import { ContextUsageIndicator } from "@/features/messages/composer/ContextUsageIndicator";
import {
  filterComposerCommands,
  type ComposerCommandDescriptor,
} from "@/features/messages/composer/commands";
import type { ContextUsage } from "@/features/messages/composer/context-usage";
import { useWorkspaceReferences } from "@/features/messages/composer/useWorkspaceReferences";
import type { ReplyQuote } from "@/features/messages/model/reply-quote";
import type {
  MapSelection,
  MapViewport,
} from "@/features/sessions/map-context";
import {
  insertReference,
  mentionQuery,
  type WorkspaceReference,
} from "@/features/workspaces/references";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { interactionCopy } from "@/locales/zh-CN/map-interactions";
import {
  ArrowUp,
  LoaderCircle,
  Paperclip,
  Quote,
  RotateCw,
  Settings2,
  Square,
  X,
} from "lucide-vue-next";
import { computed, defineComponent, shallowRef, useId } from "vue";
import { RouterLink } from "vue-router";
const content = zhCN.conversation;
const MAX_TEXTAREA_HEIGHT = 120;
interface ConversationComposerProps {
  readonly mapViewport: MapViewport;
  readonly mapSelection: MapSelection | null;
  readonly onMapSelectionClear: () => void;
  readonly contextUsage: ContextUsage | null;
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly attachmentState: ReturnType<typeof useComposerAttachments>;
  readonly draft: string;
  readonly quote: ReplyQuote | null;
  readonly onQuoteClear: () => void;
  readonly queuedDraft: boolean;
  readonly error: string | null;
  readonly draftFrozen: boolean;
  readonly modelDisabled: boolean;
  readonly modelGroups: readonly ComposerModelGroup[];
  readonly pending: boolean;
  readonly interactionLocked: boolean;
  readonly running: boolean;
  readonly stopPending: boolean;
  readonly reasoningOptions: readonly string[];
  readonly defaultReasoningEffort: string | null;
  readonly selectedModel: string;
  readonly selectedReasoningEffort: string;
  readonly sendDisabled: boolean;
  readonly showModelSettings: boolean;
  readonly commands: readonly ComposerCommandDescriptor[];
  readonly commandPending: boolean;
  readonly commandCatalogPending: boolean;
  readonly commandCatalogError: string | null;
  readonly commandFeedback: {
    readonly kind: "success" | "error";
    readonly text: string;
  } | null;
  readonly modelPickerPane: ModelPickerPane | null;
  readonly onModelPickerPaneChange: (pane: ModelPickerPane | null) => void;
  readonly onCommand: (line: string) => Promise<void>;
  readonly onExitPlan: () => void;
  readonly onDraftChange: (draft: string) => void;
  readonly onModelChange: (value: string) => void;
  readonly onReasoningEffortChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onStop: () => void;
}
export const ConversationComposer = defineComponent(
  (componentProps: ConversationComposerProps, { slots: _slots }) => {
    const mapSelection = computed(() => componentProps.mapSelection),
      onMapSelectionClear = computed(() => componentProps.onMapSelectionClear),
      mapViewport = computed(() => componentProps.mapViewport),
      contextUsage = computed(() => componentProps.contextUsage),
      sessionId = computed(() => componentProps.sessionId),
      workspaceId = computed(() => componentProps.workspaceId),
      attachmentState = computed(() => componentProps.attachmentState),
      draft = computed(() => componentProps.draft),
      quote = computed(() => componentProps.quote),
      onQuoteClear = computed(() => componentProps.onQuoteClear),
      queuedDraft = computed(() => componentProps.queuedDraft),
      error = computed(() => componentProps.error),
      draftFrozen = computed(() => componentProps.draftFrozen),
      modelDisabled = computed(() => componentProps.modelDisabled),
      modelGroups = computed(() => componentProps.modelGroups),
      pending = computed(() => componentProps.pending),
      interactionLocked = computed(() => componentProps.interactionLocked),
      running = computed(() => componentProps.running),
      stopPending = computed(() => componentProps.stopPending),
      reasoningOptions = computed(() => componentProps.reasoningOptions),
      selectedModel = computed(() => componentProps.selectedModel),
      defaultReasoningEffort = computed(
        () => componentProps.defaultReasoningEffort,
      ),
      selectedReasoningEffort = computed(
        () => componentProps.selectedReasoningEffort,
      ),
      sendDisabled = computed(() => componentProps.sendDisabled),
      showModelSettings = computed(() => componentProps.showModelSettings),
      commands = computed(() => componentProps.commands),
      commandPending = computed(() => componentProps.commandPending),
      commandFeedback = computed(() => componentProps.commandFeedback),
      modelPickerPane = computed(() => componentProps.modelPickerPane),
      onModelPickerPaneChange = computed(
        () => componentProps.onModelPickerPaneChange,
      ),
      commandCatalogPending = computed(
        () => componentProps.commandCatalogPending,
      ),
      commandCatalogError = computed(() => componentProps.commandCatalogError),
      onCommand = computed(() => componentProps.onCommand),
      onExitPlan = computed(() => componentProps.onExitPlan),
      onDraftChange = computed(() => componentProps.onDraftChange),
      onModelChange = computed(() => componentProps.onModelChange),
      onReasoningEffortChange = computed(
        () => componentProps.onReasoningEffortChange,
      ),
      onSubmit = computed(() => componentProps.onSubmit),
      onStop = computed(() => componentProps.onStop);
    const fileInputRef = shallowRef<HTMLInputElement | null>(null);
    const dragDepth = shallowRef(0);
    const draggingFiles = shallowRef(false),
      setDraggingFiles = refSetter(draggingFiles);
    const textareaRef = shallowRef<HTMLTextAreaElement | null>(null);
    const formRef = shallowRef<HTMLFormElement | null>(null);
    const commandMenuId = useId();
    const activeIndex = shallowRef(0),
      setActiveIndex = refSetter(activeIndex);
    const caret = shallowRef(draft.value.length),
      setCaret = refSetter(caret);
    const dismissedDraft = shallowRef<string | null>(null),
      setDismissedDraft = refSetter(dismissedDraft);
    const isCommand = computed(
      () => quote.value === null && draft.value.trimStart().startsWith("/"),
    );
    const inputLocked = computed(
      () =>
        pending.value ||
        stopPending.value ||
        draftFrozen.value ||
        commandPending.value ||
        interactionLocked.value,
    );
    const matchingCommands = computed(() =>
      quote.value === null
        ? filterComposerCommands(commands.value, draft.value)
        : null,
    );
    const menuOpen = computed(
      () =>
        matchingCommands.value !== null &&
        dismissedDraft.value !== draft.value &&
        !inputLocked.value,
    );
    const activeCommand = computed(
      () => matchingCommands.value?.[activeIndex.value],
    );
    const referenceQuery = computed(() =>
      !inputLocked.value &&
      !isCommand.value &&
      dismissedDraft.value !== draft.value
        ? mentionQuery(draft.value, caret.value)
        : null,
    );
    const references = useWorkspaceReferences(
      () => workspaceId.value,
      () => sessionId.value,
      () => referenceQuery.value?.query ?? null,
    );
    const referencesOpen = computed(() => referenceQuery.value !== null);
    const suggestionsOpen = computed(
      () => menuOpen.value || referencesOpen.value,
    );
    const referenceItems = computed(() =>
      references.items.map((item) => ({
        id: item.target,
        label: `@${item.name}`,
        description: item.detail,
        detail: content.references.kinds[item.kind],
        inputHint: null,
        unavailableReason: null,
      })),
    );
    const attachmentsTooLarge = computed(
      () =>
        attachmentState.value.attachments.reduce(
          (sum, ref) => sum + ref.bytes,
          0,
        ) >
        32 * 1024 * 1024,
    );
    const canSend = computed(
      () =>
        !attachmentsTooLarge.value &&
        (draft.value.trim().length > 0 ||
          attachmentState.value.attachments.length > 0) &&
        !attachmentState.value.pending &&
        !attachmentState.value.retryAvailable &&
        !pending.value &&
        !stopPending.value &&
        !commandPending.value &&
        !interactionLocked.value &&
        (isCommand.value ? !draftFrozen.value : !sendDisabled.value),
    );
    const primaryStops = computed(() => running.value && !canSend.value);
    const primaryPending = computed(() =>
      primaryStops.value
        ? stopPending.value
        : pending.value || commandPending.value,
    );
    watchMounted([() => draft.value], () => {
      const textarea = textareaRef.value;
      if (textarea === null) return;
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    });
    watchMounted([() => draft.value, () => suggestionsOpen.value], () => {
      if (!suggestionsOpen.value) return;
      function dismissOutside(event: PointerEvent) {
        if (!formRef.value?.contains(event.target as Node))
          setDismissedDraft(draft.value);
      }
      document.addEventListener("pointerdown", dismissOutside);
      return () => document.removeEventListener("pointerdown", dismissOutside);
    });
    function selectReference(item: WorkspaceReference) {
      if (referenceQuery.value === null) return;
      const inserted = insertReference(
        draft.value,
        referenceQuery.value.start,
        referenceQuery.value.end,
        item,
      );
      onDraftChange.value(inserted.value);
      setActiveIndex(0);
      setCaret(inserted.caret);
      requestAnimationFrame(() => {
        textareaRef.value?.focus();
        textareaRef.value?.setSelectionRange(inserted.caret, inserted.caret);
      });
    }
    function submit() {
      if (!canSend.value) return;
      if (isCommand.value) {
        if (menuOpen.value && activeCommand.value !== undefined) {
          selectCommand(activeCommand.value);
          return;
        }
        setDismissedDraft(draft.value);
        void onCommand.value(draft.value);
      } else onSubmit.value();
    }
    function selectCommand(command: ComposerCommandDescriptor) {
      if (command.unavailableReason !== null) return;
      if (command.input_hint !== null) {
        onDraftChange.value(`/${command.name} `);
        textareaRef.value?.focus();
        return;
      }
      setDismissedDraft(draft.value);
      void onCommand.value(`/${command.name}`);
      textareaRef.value?.focus();
    }
    function handleSubmit(event: SubmitEvent) {
      event.preventDefault();
      submit();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.isComposing || event.keyCode === 229) return;
      if (referencesOpen.value) {
        if (event.key === "Escape") {
          event.preventDefault();
          setDismissedDraft(draft.value);
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (references.items.length > 0)
            setActiveIndex(
              (index) =>
                (index +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  references.items.length) %
                references.items.length,
            );
          return;
        }
        if (!event.shiftKey && (event.key === "Enter" || event.key === "Tab")) {
          event.preventDefault();
          const item = references.items[activeIndex.value];
          if (item !== undefined) selectReference(item);
          return;
        }
      }
      if (menuOpen.value && matchingCommands.value !== null) {
        if (event.key === "Escape") {
          event.preventDefault();
          setDismissedDraft(draft.value);
          return;
        }
        if (matchingCommands.value.length > 0) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActiveIndex(
              (index) =>
                (index + step + matchingCommands.value!.length) %
                matchingCommands.value!.length,
            );
            return;
          }
          if (activeCommand.value !== undefined && !event.shiftKey) {
            if (event.key === "Tab") {
              event.preventDefault();
              onDraftChange.value(`/${activeCommand.value.name} `);
              setActiveIndex(0);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              selectCommand(activeCommand.value);
              return;
            }
          }
        }
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    }
    function handleChange(event: Event) {
      setActiveIndex(0);
      setDismissedDraft(null);
      setCaret((event.target as HTMLTextAreaElement).selectionStart ?? 0);
      onDraftChange.value((event.target as HTMLInputElement).value);
    }
    return () => {
      const _inputLocked = inputLocked.value,
        _attachmentState = attachmentState.value,
        _menuOpen = menuOpen.value,
        _matchingCommands = matchingCommands.value,
        _commandCatalogPending = commandCatalogPending.value,
        _commandCatalogError = commandCatalogError.value,
        _referencesOpen = referencesOpen.value,
        _referenceItems = referenceItems.value,
        _sessionId = sessionId.value,
        _quote = quote.value,
        _onQuoteClear = onQuoteClear.value,
        _suggestionsOpen = suggestionsOpen.value,
        _activeCommand = activeCommand.value,
        _draft = draft.value,
        _queuedDraft = queuedDraft.value,
        _running = running.value,
        _mapViewport = mapViewport.value,
        _mapSelection = mapSelection.value,
        _onMapSelectionClear = onMapSelectionClear.value,
        _onExitPlan = onExitPlan.value,
        _modelDisabled = modelDisabled.value,
        _modelGroups = modelGroups.value,
        _selectedModel = selectedModel.value,
        _reasoningOptions = reasoningOptions.value,
        _defaultReasoningEffort = defaultReasoningEffort.value,
        _selectedReasoningEffort = selectedReasoningEffort.value,
        _modelPickerPane = modelPickerPane.value,
        _onModelPickerPaneChange = onModelPickerPaneChange.value,
        _onModelChange = onModelChange.value,
        _onReasoningEffortChange = onReasoningEffortChange.value,
        _contextUsage = contextUsage.value,
        _primaryStops = primaryStops.value,
        _stopPending = stopPending.value,
        _commandPending = commandPending.value,
        _canSend = canSend.value,
        _onStop = onStop.value,
        _pending = pending.value,
        _draftFrozen = draftFrozen.value,
        _primaryPending = primaryPending.value,
        _attachmentsTooLarge = attachmentsTooLarge.value,
        _commandFeedback = commandFeedback.value,
        _error = error.value,
        _showModelSettings = showModelSettings.value;
      return (
        <div class="composer-host shrink-0 px-3 pt-2 pb-3">
          <form
            ref={formRef}
            class="chat-surface-fluid composer-panel relative rounded-[20px] border border-[var(--mu-input-border)] bg-[var(--mu-composer-bg)] px-3.5 py-2.5 transition-[border-color,box-shadow] duration-200"
            onSubmit={handleSubmit}
            onDragenter={(event) => {
              if (!event.dataTransfer!.types.includes("Files")) return;
              event.preventDefault();
              dragDepth.value += 1;
              if (
                !_inputLocked &&
                !_attachmentState.pending &&
                !_attachmentState.retryAvailable
              )
                setDraggingFiles(true);
            }}
            onDragover={(event) => {
              if (event.dataTransfer!.types.includes("Files")) {
                event.preventDefault();
                event.dataTransfer!.dropEffect = _inputLocked ? "none" : "copy";
              }
            }}
            onDragleave={(event) => {
              if (event.dataTransfer!.types.includes("Files")) {
                dragDepth.value = Math.max(0, dragDepth.value - 1);
                if (dragDepth.value === 0) setDraggingFiles(false);
              }
            }}
            onDrop={(event) => {
              if (!event.dataTransfer!.types.includes("Files")) return;
              event.preventDefault();
              dragDepth.value = 0;
              setDraggingFiles(false);
              if (!_inputLocked)
                void _attachmentState.addFiles(
                  Array.from(event.dataTransfer!.files),
                );
            }}
          >
            {_menuOpen && _matchingCommands !== null && (
              <ComposerSuggestionMenu
                id={commandMenuId}
                items={_matchingCommands.map((command) => ({
                  id: command.name,
                  label: `/${command.name}`,
                  description: command.description,
                  detail: command.when_to_use,
                  inputHint: command.input_hint,
                  unavailableReason: command.unavailableReason,
                }))}
                copy={content.commands}
                activeIndex={activeIndex.value}
                pending={_commandCatalogPending}
                error={_commandCatalogError}
                onActiveIndexChange={setActiveIndex}
                onSelect={(index) => selectCommand(_matchingCommands[index]!)}
              />
            )}
            {_referencesOpen && (
              <ComposerSuggestionMenu
                id={commandMenuId}
                items={_referenceItems}
                copy={content.references}
                activeIndex={activeIndex.value}
                pending={references.pending}
                error={references.error}
                onRetry={references.retry}
                onActiveIndexChange={setActiveIndex}
                onSelect={(index) => selectReference(references.items[index]!)}
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              class="hidden"
              tabindex={-1}
              aria-label={content.attachments.add}
              onInput={(event) => {
                const files = Array.from(
                  (event.target as HTMLInputElement).files ?? [],
                );
                (event.target as HTMLInputElement).value = "";
                if (!_inputLocked) void _attachmentState.addFiles(files);
              }}
            />
            <AttachmentStrip
              sessionId={_sessionId}
              attachments={_attachmentState.attachments}
              disabled={_inputLocked || _attachmentState.pending}
              onRemove={_attachmentState.remove}
            />
            {_quote !== null && (
              <div
                class="mb-2 flex items-start gap-2.5 rounded-[10px] bg-fill-1 px-3 py-2.5"
                data-reply-preview
              >
                <Quote class="mt-0.5 size-4 shrink-0 text-t-tertiary" />
                <div class="min-w-0 flex-1 line-clamp-3 text-[13px] leading-5 whitespace-pre-wrap break-all text-t-primary">
                  {_quote.content}
                </div>
                <button
                  type="button"
                  disabled={_inputLocked}
                  aria-label={content.reply.clear}
                  class="mt-0.5 shrink-0 rounded-full p-0.5 text-t-secondary transition-colors hover:bg-fill-3 disabled:opacity-50"
                  onClick={_onQuoteClear}
                >
                  <X class="size-3.5" />
                </button>
              </div>
            )}
            {draggingFiles.value && (
              <div class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[20px] border-2 border-dashed border-foreground/30 bg-[var(--mu-composer-bg)]/95 text-[13px] text-foreground">
                {content.attachments.drop}
              </div>
            )}
            <Textarea
              ref={textareaRef}
              data-composer-input={_sessionId}
              role="combobox"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-expanded={_suggestionsOpen}
              aria-controls={_suggestionsOpen ? commandMenuId : undefined}
              aria-activedescendant={
                _referencesOpen &&
                _referenceItems[activeIndex.value] !== undefined
                  ? `${commandMenuId}-${_referenceItems[activeIndex.value]!.id}`
                  : _menuOpen && _activeCommand !== undefined
                    ? `${commandMenuId}-${_activeCommand.name}`
                    : undefined
              }
              class="block min-h-6 w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent px-0 py-0 text-[13px] leading-5 text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0 disabled:cursor-wait"
              value={_draft}
              placeholder={
                _queuedDraft
                  ? content.queue.editPlaceholder
                  : _running
                    ? content.steeringPlaceholder
                    : content.composerPlaceholder
              }
              disabled={_inputLocked}
              rows={1}
              onPaste={(event) => {
                if (event.clipboardData!.files.length === 0) return;
                event.preventDefault();
                if (!_inputLocked)
                  void _attachmentState.addFiles(
                    Array.from(event.clipboardData!.files),
                  );
              }}
              onInput={handleChange}
              onSelect={(event) =>
                setCaret(
                  (event.currentTarget as HTMLTextAreaElement).selectionStart ??
                    0,
                )
              }
              onKeydown={handleKeyDown}
              aria-label={content.composerLabel}
            />
            <div class="composer-toolbar mt-2 flex min-h-8 items-center justify-between gap-2">
              <div class="flex min-w-0 items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  class="size-7 rounded-full text-muted-foreground"
                  disabled={
                    _inputLocked ||
                    _attachmentState.pending ||
                    _attachmentState.retryAvailable ||
                    _attachmentState.attachments.length >= 8
                  }
                  aria-label={content.attachments.add}
                  title={content.attachments.add}
                  onClick={() => fileInputRef.value?.click()}
                >
                  <Paperclip class="size-3.5" />
                </Button>
                <MapLocationLabel viewport={_mapViewport} />
                {_mapSelection !== null && (
                  <button
                    type="button"
                    class="composer-chip inline-flex min-w-0 max-w-36 items-center rounded px-1 py-1 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    title={interactionCopy.clear}
                    aria-label={`${_mapSelection.object ? (_mapSelection.name ?? interactionCopy.selectedObject) : _mapSelection.geometry.type === "Point" ? interactionCopy.selectedPoint : interactionCopy.selectedRegion}，${interactionCopy.clear}`}
                    onClick={_onMapSelectionClear}
                  >
                    <span role="status" class="truncate">
                      {_mapSelection.object
                        ? (_mapSelection.name ?? interactionCopy.selectedObject)
                        : _mapSelection.geometry.type === "Point"
                          ? interactionCopy.selectedPoint
                          : interactionCopy.selectedRegion}
                    </span>
                  </button>
                )}
              </div>
              <div class="composer-actions flex min-w-0 items-center justify-end gap-1">
                <ComposerPlanChip locked={_inputLocked} onExit={_onExitPlan} />
                <ComposerModelPicker
                  disabled={_modelDisabled}
                  groups={_modelGroups}
                  selectedModel={_selectedModel}
                  reasoningOptions={_reasoningOptions}
                  defaultReasoningEffort={_defaultReasoningEffort}
                  selectedReasoningEffort={_selectedReasoningEffort}
                  pane={_modelPickerPane}
                  onPaneChange={_onModelPickerPaneChange}
                  onModelChange={_onModelChange}
                  onReasoningEffortChange={_onReasoningEffortChange}
                  onClose={() => textareaRef.value?.focus()}
                />
                <ContextUsageIndicator value={_contextUsage} />
                <Button
                  type={_primaryStops ? "button" : "submit"}
                  variant={_primaryStops ? "outline" : "default"}
                  size="icon"
                  class={`composer-send ml-1 size-7 rounded-full shadow-none${_primaryStops ? " border-border bg-accent text-muted-foreground" : ""}`}
                  disabled={
                    _primaryStops ? _stopPending || _commandPending : !_canSend
                  }
                  onClick={_primaryStops ? _onStop : undefined}
                  aria-label={
                    _primaryStops
                      ? content.stop
                      : _pending
                        ? content.sending
                        : _draftFrozen
                          ? content.retrySend
                          : _queuedDraft
                            ? content.queue.sendEdited
                            : _running
                              ? content.steer
                              : content.send
                  }
                >
                  {_primaryPending ? (
                    <LoaderCircle
                      class="size-3.5 animate-spin"
                      strokeWidth={2.1}
                    />
                  ) : _primaryStops ? (
                    <Square
                      class="size-3"
                      fill="currentColor"
                      strokeWidth={2.1}
                    />
                  ) : _draftFrozen ? (
                    <RotateCw class="size-3.5" strokeWidth={2.1} />
                  ) : (
                    <ArrowUp class="size-4" strokeWidth={2.1} />
                  )}
                </Button>
              </div>
            </div>
            {_attachmentsTooLarge && (
              <p role="alert" class="mt-2 text-xs text-destructive">
                {content.attachments.tooLarge}
              </p>
            )}
            {_attachmentState.pending && (
              <p
                role="status"
                class="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <LoaderCircle class="size-3 animate-spin" />
                {content.attachments.uploading}
              </p>
            )}
            {_attachmentState.error !== null && (
              <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span role="alert" class="text-destructive">
                  {_attachmentState.error}
                </span>
                {_attachmentState.retryAvailable && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    class="h-6 px-1.5"
                    disabled={_inputLocked}
                    onClick={_attachmentState.retry}
                  >
                    {content.attachments.retry}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  class="h-6 px-1.5"
                  disabled={_inputLocked}
                  onClick={_attachmentState.dismissError}
                >
                  {content.attachments.dismiss}
                </Button>
              </div>
            )}
            {_commandFeedback !== null && (
              <p
                role={_commandFeedback.kind === "error" ? "alert" : "status"}
                class={`mt-2 text-xs leading-5 ${_commandFeedback.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}
              >
                {_commandFeedback.text}
              </p>
            )}
            {(_error !== null || _showModelSettings) && (
              <div class="mt-2 flex items-center justify-between gap-3 border-t border-border/60 pt-2 text-xs leading-5">
                <span
                  class="text-destructive"
                  role={_error === null ? undefined : "alert"}
                >
                  {_error}
                </span>
                {_showModelSettings && (
                  <Button
                    asChild
                    type="button"
                    size="sm"
                    variant="ghost"
                    class="h-7 px-2"
                  >
                    <RouterLink to="/settings/models">
                      <Settings2 class="size-3.5" />
                      {content.configureModels}
                    </RouterLink>
                  </Button>
                )}
              </div>
            )}
          </form>
        </div>
      );
    };
  },
  {
    name: "ConversationComposer",
    inheritAttrs: false,
    props: [
      "mapSelection",
      "onMapSelectionClear",
      "mapViewport",
      "contextUsage",
      "sessionId",
      "workspaceId",
      "attachmentState",
      "draft",
      "quote",
      "onQuoteClear",
      "queuedDraft",
      "error",
      "draftFrozen",
      "modelDisabled",
      "modelGroups",
      "pending",
      "interactionLocked",
      "running",
      "stopPending",
      "reasoningOptions",
      "selectedModel",
      "defaultReasoningEffort",
      "selectedReasoningEffort",
      "sendDisabled",
      "showModelSettings",
      "commands",
      "commandPending",
      "commandFeedback",
      "modelPickerPane",
      "onModelPickerPaneChange",
      "commandCatalogPending",
      "commandCatalogError",
      "onCommand",
      "onExitPlan",
      "onDraftChange",
      "onModelChange",
      "onReasoningEffortChange",
      "onSubmit",
      "onStop",
    ],
  },
);
