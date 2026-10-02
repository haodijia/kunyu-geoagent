import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  LoaderCircle,
  MapPinned,
  RotateCw,
  Settings2,
  Square,
} from "lucide-react";
import {
  useEffect,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.conversation;
const MAX_TEXTAREA_HEIGHT = 144;

export interface ComposerModelGroup {
  readonly id: string;
  readonly label: string;
  readonly options: readonly {
    readonly label: string;
    readonly value: string;
  }[];
}

interface ConversationComposerProps {
  readonly contextLabel: string;
  readonly draft: string;
  readonly error: string | null;
  readonly draftFrozen: boolean;
  readonly modelDisabled: boolean;
  readonly modelGroups: readonly ComposerModelGroup[];
  readonly pending: boolean;
  readonly running: boolean;
  readonly stopPending: boolean;
  readonly reasoningOptions: readonly string[];
  readonly selectedModel: string;
  readonly selectedReasoningEffort: string;
  readonly sendDisabled: boolean;
  readonly showModelSettings: boolean;
  readonly onDraftChange: (draft: string) => void;
  readonly onModelChange: (value: string) => void;
  readonly onReasoningEffortChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onStop: () => void;
}

export function ConversationComposer({
  contextLabel,
  draft,
  error,
  draftFrozen,
  modelDisabled,
  modelGroups,
  pending,
  running,
  stopPending,
  reasoningOptions,
  selectedModel,
  selectedReasoningEffort,
  sendDisabled,
  showModelSettings,
  onDraftChange,
  onModelChange,
  onReasoningEffortChange,
  onSubmit,
  onStop,
}: ConversationComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelLabel =
    modelGroups
      .flatMap((group) => group.options)
      .find((option) => option.value === selectedModel)?.label ??
    content.selectModel;
  const canSend = draft.trim().length > 0 && !pending && !sendDisabled;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [draft]);

  function submit() {
    if (canSend) onSubmit();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onDraftChange(event.target.value);
  }

  return (
    <div className="composer-host shrink-0 px-3 pt-2 pb-3">
      <form
        className="chat-surface-fluid composer-panel rounded-[20px] border border-[var(--mu-input-border)] bg-[var(--mu-composer-bg)] px-3.5 py-3 transition-[border-color,box-shadow] duration-200"
        onSubmit={handleSubmit}
      >
        <Textarea
          ref={textareaRef}
          className="block min-h-7 w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent px-0 py-0 text-[13px] leading-5 text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0 disabled:cursor-wait"
          value={draft}
          placeholder={content.composerPlaceholder}
          disabled={pending || draftFrozen}
          rows={1}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label={content.composerLabel}
        />
        <div
          className="mt-2.5 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2"
        >
          <span className="inline-flex max-w-[45%] min-w-0 items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
            <MapPinned className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{contextLabel}</span>
          </span>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="composer-chip"
                  disabled={modelDisabled}
                  aria-label={content.modelSelectorLabel}
                >
                  <Bot size={13} />
                  <span className="truncate">{modelLabel}</span>
                  <ChevronDown size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="end"
                className="max-h-80 overflow-y-auto"
              >
                {modelGroups.map((group) => (
                  <div key={group.id}>
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                      {group.label}
                    </div>
                    {group.options.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        onSelect={() => onModelChange(option.value)}
                      >
                        <span className="flex-1">{option.label}</span>
                        {selectedModel === option.value && <Check size={12} />}
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {reasoningOptions.length > 0 || selectedReasoningEffort !== "" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="composer-chip"
                    disabled={modelDisabled}
                    aria-label={content.reasoningSelectorLabel}
                  >
                    {selectedReasoningEffort === ""
                      ? content.reasoningNotSpecified
                      : content.reasoningValue(selectedReasoningEffort)}
                    <ChevronDown size={12} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end">
                  <DropdownMenuItem
                    onSelect={() => onReasoningEffortChange("")}
                  >
                    {content.reasoningNotSpecified}
                  </DropdownMenuItem>
                  {reasoningOptions.map((effort) => (
                    <DropdownMenuItem
                      key={effort}
                      onSelect={() => onReasoningEffortChange(effort)}
                    >
                      {content.reasoningValue(effort)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Button
              type="submit"
              size="icon"
              className="composer-send ml-1 size-7 rounded-full shadow-none"
              disabled={!canSend}
              aria-label={
                pending
                  ? content.sending
                  : draftFrozen
                    ? content.retrySend
                    : content.send
              }
            >
              {pending ? (
                <LoaderCircle
                  className="size-3.5 animate-spin"
                  strokeWidth={2.1}
                />
              ) : draftFrozen ? (
                <RotateCw className="size-3.5" strokeWidth={2.1} />
              ) : (
                <ArrowUp className="size-4" strokeWidth={2.1} />
              )}
            </Button>
            {running ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="ml-1 size-7 rounded-full border-border bg-accent text-muted-foreground shadow-none"
                disabled={stopPending}
                onClick={onStop}
                aria-label={content.stop}
              >
                {stopPending ? (
                  <LoaderCircle
                    className="size-3.5 animate-spin"
                    strokeWidth={2.1}
                  />
                ) : (
                  <Square
                    className="size-3"
                    fill="currentColor"
                    strokeWidth={2.1}
                  />
                )}
              </Button>
            ) : null}
          </div>
        </div>
        {error !== null || showModelSettings ? (
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/60 pt-2 text-xs leading-5">
            <span
              className="text-destructive"
              role={error === null ? undefined : "alert"}
            >
              {error}
            </span>
            {showModelSettings ? (
              <Button
                asChild
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2"
              >
                <Link to="/settings/models">
                  <Settings2 className="size-3.5" />
                  {content.configureModels}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}
