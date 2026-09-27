import { ArrowUp } from "lucide-react";
import {
  useEffect,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent
} from "react";

import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.conversation;
const MAX_TEXTAREA_HEIGHT = 144;

interface ConversationComposerProps {
  readonly draft: string;
  readonly error: string | null;
  readonly pending: boolean;
  readonly onDraftChange: (draft: string) => void;
  readonly onSubmit: () => void;
}

export function ConversationComposer({
  draft,
  error,
  pending,
  onDraftChange,
  onSubmit
}: ConversationComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = draft.trim().length > 0 && !pending;

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
    <div className="shrink-0 px-6 pt-3 pb-6">
      <form
        className="mx-auto max-w-[880px] rounded-2xl border border-slate-200 bg-white px-4 pt-3 pb-3 shadow-[0_12px_32px_rgba(15,23,42,0.08)] focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-200/70"
        onSubmit={handleSubmit}
      >
        <textarea
          ref={textareaRef}
          className="block min-h-12 w-full resize-none overflow-y-auto border-0 bg-transparent px-1 py-1 text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-400 disabled:cursor-wait"
          value={draft}
          placeholder={content.composerPlaceholder}
          disabled={pending}
          rows={1}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label={content.composerLabel}
        />
        <div className="mt-2 flex min-h-8 items-end justify-between gap-4">
          <div className="min-w-0 text-xs leading-5">
            {error === null ? (
              <span className="text-slate-400">{content.composerHint}</span>
            ) : (
              <span className="text-red-600" role="alert">
                {error}
              </span>
            )}
          </div>
          <Button
            type="submit"
            size="icon"
            className="size-8 rounded-full bg-slate-900 text-white shadow-none hover:bg-slate-700"
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
