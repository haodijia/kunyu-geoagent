import {
  ArrowUp,
  LoaderCircle,
  MapPinned,
  RotateCw,
  Settings2
} from "lucide-react";
import {
  useEffect,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent
} from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
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
  readonly compact?: boolean;
  readonly contextLabel: string;
  readonly draft: string;
  readonly error: string | null;
  readonly draftFrozen: boolean;
  readonly modelDisabled: boolean;
  readonly modelGroups: readonly ComposerModelGroup[];
  readonly pending: boolean;
  readonly reasoningOptions: readonly string[];
  readonly selectedModel: string;
  readonly selectedReasoningEffort: string;
  readonly sendDisabled: boolean;
  readonly showModelSettings: boolean;
  readonly onDraftChange: (draft: string) => void;
  readonly onModelChange: (value: string) => void;
  readonly onReasoningEffortChange: (value: string) => void;
  readonly onSubmit: () => void;
}

export function ConversationComposer({
  compact = false,
  contextLabel,
  draft,
  error,
  draftFrozen,
  modelDisabled,
  modelGroups,
  pending,
  reasoningOptions,
  selectedModel,
  selectedReasoningEffort,
  sendDisabled,
  showModelSettings,
  onDraftChange,
  onModelChange,
  onReasoningEffortChange,
  onSubmit
}: ConversationComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
    <div className={compact ? "shrink-0 px-4 pb-4" : "shrink-0 px-6 pt-3 pb-6"}>
      <form
        className={`mx-auto border border-border bg-background px-4 shadow-md focus-within:border-input focus-within:ring-2 focus-within:ring-ring/50 ${
          compact
            ? "max-w-[720px] rounded-xl pt-2 pb-2"
            : "max-w-[880px] rounded-2xl pt-3 pb-3"
        }`}
        onSubmit={handleSubmit}
      >
        <Textarea
          ref={textareaRef}
          className={`block w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent px-1 py-1 text-sm leading-6 text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0 disabled:cursor-wait ${compact ? "min-h-9" : "min-h-12"}`}
          value={draft}
          placeholder={content.composerPlaceholder}
          disabled={pending || draftFrozen}
          rows={1}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label={content.composerLabel}
        />
        <div className={`${compact ? "mt-1" : "mt-2"} flex min-h-8 flex-wrap items-end justify-between gap-x-4 gap-y-2`}>
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <MapPinned className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{contextLabel}</span>
          </span>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <select
              className="max-w-56 rounded-md border-0 bg-transparent px-2 py-1 text-xs text-foreground outline-none hover:bg-muted focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
              value={selectedModel}
              disabled={modelDisabled}
              aria-label={content.modelSelectorLabel}
              onChange={(event) => onModelChange(event.target.value)}
            >
              <option value="">{content.selectModel}</option>
              {modelGroups.map((group) => (
                <optgroup key={group.id} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {reasoningOptions.length > 0 || selectedReasoningEffort !== "" ? (
              <select
                className="max-w-44 rounded-md border-0 bg-transparent px-2 py-1 text-xs text-foreground outline-none hover:bg-muted focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
                value={selectedReasoningEffort}
                disabled={modelDisabled}
                aria-label={content.reasoningSelectorLabel}
                onChange={(event) => onReasoningEffortChange(event.target.value)}
              >
                <option value="">{content.reasoningNotSpecified}</option>
                {reasoningOptions.map((effort) => (
                  <option key={effort} value={effort}>
                    {content.reasoningValue(effort)}
                  </option>
                ))}
              </select>
            ) : null}
            <Button
              type="submit"
              size="icon"
              className="size-8 rounded-full shadow-none"
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
                <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.1} />
              ) : draftFrozen ? (
                <RotateCw className="size-3.5" strokeWidth={2.1} />
              ) : (
                <ArrowUp className="size-4" strokeWidth={2.1} />
              )}
            </Button>
          </div>
        </div>
        <div className="mt-1.5 flex min-h-5 items-center justify-between gap-3 px-1 text-xs leading-5">
          <span
            className={error === null ? "text-muted-foreground" : "text-destructive"}
            role={error === null ? undefined : "alert"}
          >
            {error ?? content.composerHint}
          </span>
          {showModelSettings ? (
            <Button asChild type="button" size="sm" variant="ghost" className="h-7 px-2">
              <Link to="/settings/models">
                <Settings2 className="size-3.5" />
                {content.configureModels}
              </Link>
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
