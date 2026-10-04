import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Pencil,
  X,
} from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageMarkdown } from "@/features/messages/MessageMarkdown";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import type { HumanQuestion, QuestionAnswer } from "./api";
import { useQuestionDraft, type AnswerDraft } from "./useQuestionDraft";

const copy = zhCN.questions;
function displayLabel(label: string) {
  const suffix =
    /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i;
  return { label: label.replace(suffix, ""), recommended: suffix.test(label) };
}
const answered = (draft: AnswerDraft) =>
  draft.selected.length > 0 || draft.custom.trim() !== "";
const completed = (draft: AnswerDraft) => answered(draft) || draft.skipped;

export function QuestionFlow({
  question: pending,
  busy,
  error: remoteError,
  onResetError,
  onDecide,
}: {
  readonly question: HumanQuestion;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onResetError: () => void;
  readonly onDecide: (
    answers: readonly QuestionAnswer[] | null,
  ) => Promise<boolean>;
}) {
  const draftState = useQuestionDraft(pending);
  const [error, setError] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const focused = useRef(new Set<number>());
  const titleId = `question-${pending.id}`;
  async function decide(answers: readonly QuestionAnswer[] | null) {
    if (!(await onDecide(answers))) return;
    try {
      draftState.clear();
    } catch (cause) {
      console.error("[questions] Failed to clear settled answer draft.", {
        id: pending.id,
        cause,
      });
    }
  }

  if (draftState.progress === null)
    return (
      <div
        className="chat-surface-fluid rounded-[20px] border border-border bg-background p-4"
        role="alert"
      >
        <p>{draftState.error}</p>
        <Button
          className="mt-2"
          variant="outline"
          disabled={busy}
          onClick={draftState.reset}
        >
          {copy.resetDraft}
        </Button>
        <Button
          className="ml-2"
          variant="ghost"
          disabled={busy}
          onClick={() => void decide(null)}
        >
          {copy.dismiss}
        </Button>
      </div>
    );
  const { index, drafts } = draftState.progress,
    question = pending.questions[index],
    draft = drafts[index];
  if (question === undefined || draft === undefined)
    throw new Error("Question draft is out of bounds.");
  const currentDraft: AnswerDraft = draft;
  function replace(values: readonly AnswerDraft[], nextIndex = index) {
    if (!draftState.replace(nextIndex, values)) return false;
    setError(null);
    onResetError();
    return true;
  }
  function change(
    update: (current: AnswerDraft) => AnswerDraft,
    nextIndex = index,
  ) {
    replace(
      drafts.map((item, i) => (i === index ? update(item) : item)),
      nextIndex,
    );
  }
  async function submit(values: readonly AnswerDraft[]) {
    const missing = values.findIndex((item) => !completed(item));
    if (missing >= 0) {
      replace(values, missing);
      setError(copy.incomplete);
      return;
    }
    const answers = pending.questions.map((item, i): QuestionAnswer => {
      const value = values[i];
      if (value === undefined) throw new Error("Missing question answer.");
      const custom = value.custom.trim();
      return {
        id: item.id,
        selected: value.skipped
          ? []
          : custom !== "" && !item.multi_select
            ? []
            : value.selected,
        ...(custom === "" || value.skipped ? {} : { custom }),
      };
    });
    await decide(answers);
  }
  function next() {
    if (!answered(currentDraft)) {
      setError(copy.unanswered);
      return;
    }
    if (index < drafts.length - 1) replace(drafts, index + 1);
    else void submit(drafts);
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    )
      return;
    event.preventDefault();
    next();
  }
  function skip() {
    const values = drafts.map((item, i) =>
      i === index ? { selected: [], custom: "", skipped: true } : item,
    );
    if (!replace(values, index < drafts.length - 1 ? index + 1 : index)) return;
    if (index === drafts.length - 1) void submit(values);
  }
  return (
    <section
      className="chat-surface-fluid composer-panel flex max-h-[min(60vh,520px)] flex-col overflow-hidden rounded-[20px] border border-[var(--mu-input-border)] bg-[var(--mu-composer-bg)] pb-2.5 text-foreground"
      aria-labelledby={titleId}
      data-question-key={pending.id}
    >
      <header
        className={cn(
          "flex shrink-0 items-start justify-between gap-4 px-4 pt-5 pl-6",
          minimized && "pb-4",
        )}
      >
        <div className="min-w-0">
          {question.header !== null && (
            <p className="mb-1 text-[11px] leading-4 text-muted-foreground">
              {question.header}
            </p>
          )}
          <h2
            id={titleId}
            className="text-[16px] font-medium leading-[22px] break-words"
          >
            {question.question}
          </h2>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-6 rounded-full"
            aria-label={minimized ? copy.expand : copy.minimize}
            aria-expanded={!minimized}
            disabled={busy}
            onClick={() => setMinimized((value) => !value)}
          >
            {minimized ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 rounded-full"
            aria-label={copy.dismiss}
            title={copy.dismissHint}
            disabled={busy}
            onClick={() => void decide(null)}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>
      {!minimized && (
        <>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2"
            data-question-scroll
          >
            {question.detail !== null && (
              <div className="mx-2 mb-2">
                <MessageMarkdown text={question.detail} />
              </div>
            )}
            <div
              className="flex flex-col gap-px"
              role={question.multi_select ? "group" : "radiogroup"}
              aria-label={question.question}
            >
              {question.options.map((option, optionIndex) => {
                const selected = draft.selected.includes(option.label),
                  display = displayLabel(option.label);
                return (
                  <button
                    key={option.label}
                    type="button"
                    role={question.multi_select ? "checkbox" : "radio"}
                    aria-checked={selected}
                    aria-label={display.label}
                    disabled={busy}
                    className={cn(
                      "flex min-h-10 shrink-0 items-start gap-2 rounded-xl border border-transparent py-2 pr-3 pl-2 text-left transition-colors hover:enabled:bg-muted disabled:cursor-wait",
                      selected &&
                        !question.multi_select &&
                        "border-border bg-muted",
                    )}
                    onClick={() =>
                      change(
                        (current) =>
                          question.multi_select
                            ? {
                                ...current,
                                selected: selected
                                  ? current.selected.filter(
                                      (label) => label !== option.label,
                                    )
                                  : [...current.selected, option.label],
                                skipped: false,
                              }
                            : {
                                selected: [option.label],
                                custom: "",
                                skipped: false,
                              },
                        !question.multi_select && index < drafts.length - 1
                          ? index + 1
                          : index,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && drafts.every(completed)) {
                        event.preventDefault();
                        void submit(drafts);
                      }
                    }}
                  >
                    <span
                      className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-muted text-xs"
                      aria-hidden="true"
                    >
                      {question.multi_select ? (
                        <span
                          className={cn(
                            "grid size-3.5 place-items-center rounded border border-foreground/40",
                            selected &&
                              "border-foreground bg-foreground text-background",
                          )}
                        >
                          {selected && <Check className="size-3" />}
                        </span>
                      ) : (
                        optionIndex + 1
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 break-words">
                      <span className="text-sm font-medium leading-6">
                        {display.label}
                      </span>
                      {display.recommended && (
                        <span className="rounded-md bg-primary/20 px-1 text-[11px] font-semibold leading-[18px]">
                          {copy.recommended}
                        </span>
                      )}
                      {option.description !== null && (
                        <span className="text-xs leading-6 text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
              <div
                className={cn(
                  "mt-1 flex items-start gap-2 rounded-xl border p-2",
                  question.options.length === 0 || draft.custom !== ""
                    ? "border-border"
                    : "border-transparent",
                )}
              >
                {question.options.length > 0 && (
                  <span
                    aria-hidden="true"
                    className="mt-1 grid size-5 shrink-0 place-items-center text-muted-foreground"
                  >
                    {question.multi_select ? (
                      <span
                        className={cn(
                          "grid size-3.5 place-items-center rounded border border-foreground/40",
                          draft.custom.trim() !== "" &&
                            "border-foreground bg-foreground text-background",
                        )}
                      >
                        {draft.custom.trim() !== "" && (
                          <Check className="size-3" />
                        )}
                      </span>
                    ) : (
                      <Pencil className="size-3" />
                    )}
                  </span>
                )}
                <div className="grid min-w-0 flex-1 text-sm leading-6">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none invisible col-start-1 row-start-1 max-h-36 min-h-6 overflow-hidden break-words whitespace-pre-wrap"
                  >{`${draft.custom}\n`}</div>
                  <Textarea
                    key={question.id}
                    value={draft.custom}
                    rows={1}
                    maxLength={32768}
                    aria-label={copy.customLabel}
                    autoFocus={
                      question.options.length === 0 &&
                      !focused.current.has(index)
                    }
                    className="col-start-1 row-start-1 h-full max-h-36 min-h-6 resize-none rounded-none border-0 bg-transparent p-0 text-sm leading-6 shadow-none focus-visible:ring-0"
                    disabled={busy}
                    placeholder={copy.customPlaceholder}
                    onFocus={() => focused.current.add(index)}
                    onChange={(event) =>
                      change((current) => ({
                        ...current,
                        selected: question.multi_select ? current.selected : [],
                        custom: event.target.value,
                        skipped: false,
                      }))
                    }
                    onKeyDown={keyDown}
                  />
                </div>
              </div>
            </div>
          </div>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pt-1.5">
            <div className="flex items-center gap-1.5">
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={copy.previous}
                disabled={busy || index === 0}
                onClick={() => replace(drafts, index - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {index + 1} / {drafts.length}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={copy.nextQuestion}
                disabled={busy || index === drafts.length - 1}
                onClick={() => replace(drafts, index + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={skip}
              >
                {copy.skip}
              </Button>
              <Button
                size="sm"
                disabled={busy || !answered(draft)}
                onClick={next}
              >
                {busy
                  ? copy.submitting
                  : index === drafts.length - 1
                    ? copy.submit
                    : copy.continue}
              </Button>
            </div>
          </footer>
        </>
      )}
      {(error ?? remoteError ?? draftState.error) !== null && (
        <p role="alert" className="px-6 pt-2 text-xs text-destructive">
          {error ?? remoteError ?? draftState.error}
        </p>
      )}
    </section>
  );
}
