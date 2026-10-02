import { ArrowUp, LoaderCircle, MapPinned, RotateCw, Settings2, Slash, Square } from "lucide-react";
import {
  useEffect, useId, useRef, useState,
  type ChangeEvent, type FormEvent, type KeyboardEvent,
} from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { zhCN } from "@/locales/zh-CN";
import { ComposerCommandMenu } from "./composer/ComposerCommandMenu";
import { ComposerModelPicker, type ComposerModelGroup, type ModelPickerPane } from "./composer/ComposerModelPicker";
import { filterComposerCommands, parseComposerCommand, type ComposerCommandDescriptor } from "./composer/commands";
import { DraftBoxIcon } from "./composer/DraftBoxIcon";

const content = zhCN.conversation;
const MAX_TEXTAREA_HEIGHT = 120;

interface ConversationComposerProps {
  readonly contextLabel: string;
  readonly draft: string;
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
  readonly commandFeedback: { readonly kind: "success" | "error"; readonly text: string } | null;
  readonly modelPickerPane: ModelPickerPane | null;
  readonly onModelPickerPaneChange: (pane: ModelPickerPane | null) => void;
  readonly onCommand: (line: string) => Promise<void>;
  readonly onDraftChange: (draft: string) => void;
  readonly onModelChange: (value: string) => void;
  readonly onReasoningEffortChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onQueue: () => void;
  readonly onStop: () => void;
}

export function ConversationComposer({
  contextLabel, draft, error, draftFrozen, modelDisabled, modelGroups,
  pending, interactionLocked, running, stopPending, reasoningOptions, selectedModel,
  defaultReasoningEffort,
  selectedReasoningEffort, sendDisabled, showModelSettings, commands,
  commandPending, commandFeedback, modelPickerPane, onModelPickerPaneChange,
  commandCatalogPending, commandCatalogError,
  onCommand, onDraftChange, onModelChange, onReasoningEffortChange, onSubmit, onQueue, onStop,
}: ConversationComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const commandMenuId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedDraft, setDismissedDraft] = useState<string | null>(null);
  const isCommand = draft.trimStart().startsWith("/");
  const inputLocked = pending || draftFrozen || commandPending || interactionLocked;
  const matchingCommands = filterComposerCommands(commands, draft);
  const menuOpen = matchingCommands !== null && dismissedDraft !== draft && !inputLocked;
  const activeCommand = matchingCommands?.[activeIndex];
  const queueable = !isCommand || commands.some((item) => item.kind === "skill" && item.name === parseComposerCommand(draft)?.name && item.unavailableReason === null);
  const canSend = draft.trim().length > 0 && !pending && !commandPending && !interactionLocked &&
    (isCommand ? !draftFrozen : !sendDisabled);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [draft]);

  useEffect(() => {
    if (!menuOpen) return;
    function dismissOutside(event: PointerEvent) {
      if (!formRef.current?.contains(event.target as Node)) setDismissedDraft(draft);
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [draft, menuOpen]);

  function submit() {
    if (!canSend) return;
    if (isCommand) {
      if (menuOpen && activeCommand !== undefined) {
        selectCommand(activeCommand);
        return;
      }
      setDismissedDraft(draft);
      void onCommand(draft);
    } else onSubmit();
  }

  function selectCommand(command: ComposerCommandDescriptor) {
    if (command.unavailableReason !== null) return;
    if (command.input_hint !== null) {
      onDraftChange(`/${command.name} `);
      textareaRef.current?.focus();
      return;
    }
    setDismissedDraft(draft);
    void onCommand(`/${command.name}`);
    textareaRef.current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (menuOpen && matchingCommands !== null) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedDraft(draft);
        return;
      }
      if (matchingCommands.length > 0) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          setActiveIndex((index) => (index + step + matchingCommands.length) % matchingCommands.length);
          return;
        }
        if (activeCommand !== undefined && !event.shiftKey) {
          if (event.key === "Tab") {
            event.preventDefault();
            onDraftChange(`/${activeCommand.name} `);
            setActiveIndex(0);
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            selectCommand(activeCommand);
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

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setActiveIndex(0);
    setDismissedDraft(null);
    onDraftChange(event.target.value);
  }

  return (
    <div className="composer-host shrink-0 px-3 pt-2 pb-3">
      <form
        ref={formRef}
        className="chat-surface-fluid composer-panel relative rounded-[20px] border border-[var(--mu-input-border)] bg-[var(--mu-composer-bg)] px-3.5 py-2.5 transition-[border-color,box-shadow] duration-200"
        onSubmit={handleSubmit}
      >
        {menuOpen && matchingCommands !== null && (
          <ComposerCommandMenu
            id={commandMenuId}
            commands={matchingCommands}
            activeIndex={activeIndex}
            pending={commandCatalogPending}
            error={commandCatalogError}
            onActiveIndexChange={setActiveIndex}
            onSelect={selectCommand}
          />
        )}
        <Textarea
          ref={textareaRef}
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? commandMenuId : undefined}
          aria-activedescendant={menuOpen && activeCommand !== undefined ? `${commandMenuId}-${activeCommand.name}` : undefined}
          className="block min-h-6 w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent px-0 py-0 text-[13px] leading-5 text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0 disabled:cursor-wait"
          value={draft}
          placeholder={running ? content.steeringPlaceholder : content.composerPlaceholder}
          disabled={inputLocked}
          rows={1}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label={content.composerLabel}
        />
        <div className="mt-2 flex min-h-8 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <Button
              type="button" size="icon" variant="ghost" className="size-7 rounded-full text-muted-foreground"
              disabled={inputLocked || (draft.trim().length > 0 && !isCommand)}
              aria-label={content.commands.triggerLabel}
              onClick={() => {
                setActiveIndex(0);
                setDismissedDraft(null);
                onDraftChange("/");
                textareaRef.current?.focus();
              }}
            ><Slash className="size-3.5" /></Button>
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground" title={contextLabel}>
              <MapPinned className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{content.mapContextLabel}</span>
            </span>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-1">
              <Button type="button" size="icon" variant="ghost" className="size-7 rounded-full text-muted-foreground"
                disabled={!canSend || !queueable || draftFrozen} aria-label={content.queue.add} title={content.queue.add} onClick={onQueue}
              ><DraftBoxIcon size={15} /></Button>
            <ComposerModelPicker
              disabled={modelDisabled}
              groups={modelGroups}
              selectedModel={selectedModel}
              reasoningOptions={reasoningOptions}
              defaultReasoningEffort={defaultReasoningEffort}
              selectedReasoningEffort={selectedReasoningEffort}
              pane={modelPickerPane}
              onPaneChange={onModelPickerPaneChange}
              onModelChange={onModelChange}
              onReasoningEffortChange={onReasoningEffortChange}
              onClose={() => textareaRef.current?.focus()}
            />
            <Button
              type="submit" size="icon" className="composer-send ml-1 size-7 rounded-full shadow-none"
              disabled={!canSend}
              aria-label={pending ? content.sending : draftFrozen ? content.retrySend : running ? content.steer : content.send}
            >
              {pending || commandPending ? <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.1} />
                : draftFrozen ? <RotateCw className="size-3.5" strokeWidth={2.1} />
                  : <ArrowUp className="size-4" strokeWidth={2.1} />}
            </Button>
            {running && (
              <Button
                type="button" variant="outline" size="icon"
                className="ml-1 size-7 rounded-full border-border bg-accent text-muted-foreground shadow-none"
                disabled={stopPending || commandPending} onClick={onStop} aria-label={content.stop}
              >
                {stopPending ? <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.1} />
                  : <Square className="size-3" fill="currentColor" strokeWidth={2.1} />}
              </Button>
            )}
          </div>
        </div>
        {commandFeedback !== null && (
          <p role={commandFeedback.kind === "error" ? "alert" : "status"} className={`mt-2 text-xs leading-5 ${commandFeedback.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {commandFeedback.text}
          </p>
        )}
        {(error !== null || showModelSettings) && (
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/60 pt-2 text-xs leading-5">
            <span className="text-destructive" role={error === null ? undefined : "alert"}>{error}</span>
            {showModelSettings && (
              <Button asChild type="button" size="sm" variant="ghost" className="h-7 px-2">
                <Link to="/settings/models"><Settings2 className="size-3.5" />{content.configureModels}</Link>
              </Button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
