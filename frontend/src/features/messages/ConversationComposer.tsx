import { ArrowUp } from "lucide-react";
import {
  useEffect,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent
} from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.conversation;
const MAX_TEXTAREA_HEIGHT = 144;

interface ConversationComposerProps {
  readonly compact?: boolean;
  readonly draft: string;
  readonly error: string | null;
  readonly draftFrozen: boolean;
  readonly modelDisabled: boolean;
  readonly modelOptions: readonly { readonly label: string; readonly value: string }[];
  readonly pending: boolean;
  readonly selectedModel: string;
  readonly sendDisabled: boolean;
  readonly onDraftChange: (draft: string) => void;
  readonly onModelChange: (value: string) => void;
  readonly onSubmit: () => void;
}

export function ConversationComposer({
  compact = false,
  draft,
  error,
  draftFrozen,
  modelDisabled,
  modelOptions,
  pending,
  selectedModel,
  sendDisabled,
  onDraftChange,
  onModelChange,
  onSubmit
}: ConversationComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = draft.trim().length > 0 && !pending && !sendDisabled;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [draft]);

  function submit() {
    if (canSend) {
      onSubmit();
    }
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
        <div className={`${compact ? "mt-1" : "mt-2"} flex min-h-8 items-end justify-between gap-4`}>
          <div className="flex min-w-0 items-center gap-3 text-xs leading-5">
            <select
              className="max-w-48 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
              value={selectedModel}
              disabled={modelDisabled}
              aria-label={content.modelSelectorLabel}
              onChange={(event) => onModelChange(event.target.value)}
            >
              <option value="">{content.selectModel}</option>
              {modelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {error === null ? (
              <span className="text-muted-foreground">{content.composerHint}</span>
            ) : (
              <span className="text-destructive" role="alert">
                {error}
              </span>
            )}
          </div>
          <Button
            type="submit"
            size="icon"
            className="size-8 rounded-full shadow-none"
            disabled={!canSend}
            aria-label={pending ? content.sending : content.send}
          >
            <ArrowUp className="size-4" strokeWidth={2.1} />
          </Button>
        </div>
      </form>
    </div>
  );
}
