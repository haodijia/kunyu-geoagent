import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageMarkdown } from "@/features/messages/rendering/MessageMarkdown";
import type { HumanQuestion, QuestionAnswer } from "@/features/questions/api";
import {
  useQuestionDraft,
  type AnswerDraft,
} from "@/features/questions/useQuestionDraft";
import { refSetter } from "@/lib/lifecycle";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Pencil,
  X,
} from "lucide-vue-next";
import { computed, defineComponent, shallowRef } from "vue";
const copy = zhCN.questions;
function displayLabel(label: string) {
  const suffix =
    /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i;
  return {
    label: label.replace(suffix, ""),
    recommended: suffix.test(label),
  };
}
const answered = (draft: AnswerDraft) =>
  draft.selected.length > 0 || draft.custom.trim() !== "";
const completed = (draft: AnswerDraft) => answered(draft) || draft.skipped;
export const QuestionFlow = defineComponent(
  (
    componentProps: {
      readonly question: HumanQuestion;
      readonly busy: boolean;
      readonly error: string | null;
      readonly onResetError: () => void;
      readonly onDecide: (
        answers: readonly QuestionAnswer[] | null,
      ) => Promise<boolean>;
    },
    { slots: _slots },
  ) => {
    const pending = computed(() => componentProps.question),
      busy = computed(() => componentProps.busy),
      remoteError = computed(() => componentProps.error),
      onResetError = computed(() => componentProps.onResetError),
      onDecide = computed(() => componentProps.onDecide);
    const draftState = useQuestionDraft(() => pending.value);
    const error = shallowRef<string | null>(null),
      setError = refSetter(error);
    const minimized = shallowRef(false),
      setMinimized = refSetter(minimized);
    const focused = shallowRef(new Set<number>());
    const titleId = computed(() => `question-${pending.value.id}`);
    async function decide(answers: readonly QuestionAnswer[] | null) {
      if (!(await onDecide.value(answers))) return;
      try {
        draftState.clear();
      } catch (cause) {
        console.error("[questions] Failed to clear settled answer draft.", {
          id: pending.value.id,
          cause,
        });
      }
    }
    const progress = computed(() => {
      if (draftState.progress === null)
        throw new Error("Question draft is unavailable.");
      return draftState.progress;
    });
    const index = computed(() => progress.value.index);
    const drafts = computed(() => progress.value.drafts);
    const question = computed(() => {
      const value = pending.value.questions[index.value];
      if (value === undefined)
        throw new Error("Question draft is out of bounds.");
      return value;
    });
    const draft = computed(() => {
      const value = drafts.value[index.value];
      if (value === undefined)
        throw new Error("Question answer is out of bounds.");
      return value;
    });
    function replace(values: readonly AnswerDraft[], nextIndex = index.value) {
      if (!draftState.replace(nextIndex, values)) return false;
      setError(null);
      onResetError.value();
      return true;
    }
    function change(
      update: (current: AnswerDraft) => AnswerDraft,
      nextIndex = index.value,
    ) {
      replace(
        drafts.value.map((item, i) =>
          i === index.value ? update(item) : item,
        ),
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
      const answers = pending.value.questions.map((item, i): QuestionAnswer => {
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
          ...(custom === "" || value.skipped
            ? {}
            : {
                custom,
              }),
        };
      });
      await decide(answers);
    }
    function next() {
      if (!answered(draft.value)) {
        setError(copy.unanswered);
        return;
      }
      if (index.value < drafts.value.length - 1)
        replace(drafts.value, index.value + 1);
      else void submit(drafts.value);
    }
    function keyDown(event: KeyboardEvent) {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.isComposing ||
        event.keyCode === 229
      )
        return;
      event.preventDefault();
      next();
    }
    function skip() {
      const values = drafts.value.map((item, i) =>
        i === index.value
          ? {
              selected: [],
              custom: "",
              skipped: true,
            }
          : item,
      );
      if (
        !replace(
          values,
          index.value < drafts.value.length - 1 ? index.value + 1 : index.value,
        )
      )
        return;
      if (index.value === drafts.value.length - 1) void submit(values);
    }
    return () => {
      const _busy = busy.value,
        _titleId = titleId.value,
        _pending = pending.value,
        _remoteError = remoteError.value;
      if (draftState.progress === null)
        return (
          <div
            class="chat-surface-fluid rounded-[20px] border border-border bg-background p-4"
            role="alert"
          >
            <p>{draftState.error}</p>
            <Button
              class="mt-2"
              variant="outline"
              disabled={_busy}
              onClick={draftState.reset}
            >
              {copy.resetDraft}
            </Button>
            <Button
              class="ml-2"
              variant="ghost"
              disabled={_busy}
              onClick={() => void decide(null)}
            >
              {copy.dismiss}
            </Button>
          </div>
        );
      const _question = question.value;
      return (
        <section
          class="chat-surface-fluid composer-panel flex max-h-[min(60vh,520px)] flex-col overflow-hidden rounded-[20px] border border-[var(--mu-input-border)] bg-[var(--mu-composer-bg)] pb-2.5 text-foreground"
          aria-labelledby={_titleId}
          data-question-key={_pending.id}
        >
          <header
            class={cn(
              "flex shrink-0 items-start justify-between gap-4 px-4 pt-5 pl-6",
              minimized.value && "pb-4",
            )}
          >
            <div class="min-w-0">
              {_question.header !== null && (
                <p class="mb-1 text-[11px] leading-4 text-muted-foreground">
                  {_question.header}
                </p>
              )}
              <h2
                id={_titleId}
                class="text-[16px] font-medium leading-[22px] break-words"
              >
                {_question.question}
              </h2>
            </div>
            <div class="flex shrink-0 gap-1">
              <Button
                size="icon"
                variant="ghost"
                class="size-6 rounded-full"
                aria-label={minimized.value ? copy.expand : copy.minimize}
                aria-expanded={!minimized.value}
                disabled={_busy}
                onClick={() => setMinimized((value) => !value)}
              >
                {minimized.value ? (
                  <ChevronUp class="size-4" />
                ) : (
                  <ChevronDown class="size-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="size-6 rounded-full"
                aria-label={copy.dismiss}
                title={copy.dismissHint}
                disabled={_busy}
                onClick={() => void decide(null)}
              >
                <X class="size-4" />
              </Button>
            </div>
          </header>
          {!minimized.value && (
            <>
              <div
                class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2"
                data-question-scroll
              >
                {_question.detail !== null && (
                  <div class="mx-2 mb-2">
                    <MessageMarkdown text={_question.detail} />
                  </div>
                )}
                <div
                  class="flex flex-col gap-px"
                  role={_question.multi_select ? "group" : "radiogroup"}
                  aria-label={_question.question}
                >
                  {_question.options.map((option, optionIndex) => {
                    const selected = draft.value.selected.includes(
                        option.label,
                      ),
                      display = displayLabel(option.label);
                    return (
                      <button
                        key={option.label}
                        type="button"
                        role={_question.multi_select ? "checkbox" : "radio"}
                        aria-checked={selected}
                        aria-label={display.label}
                        disabled={_busy}
                        class={cn(
                          "flex min-h-10 shrink-0 items-start gap-2 rounded-xl border border-transparent py-2 pr-3 pl-2 text-left transition-colors hover:enabled:bg-muted disabled:cursor-wait",
                          selected &&
                            !_question.multi_select &&
                            "border-border bg-muted",
                        )}
                        onClick={() =>
                          change(
                            (current) =>
                              _question.multi_select
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
                            !_question.multi_select &&
                              index.value < drafts.value.length - 1
                              ? index.value + 1
                              : index.value,
                          )
                        }
                        onKeydown={(event) => {
                          if (
                            event.key === "Enter" &&
                            drafts.value.every(completed)
                          ) {
                            event.preventDefault();
                            void submit(drafts.value);
                          }
                        }}
                      >
                        <span
                          class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-muted text-xs"
                          aria-hidden="true"
                        >
                          {_question.multi_select ? (
                            <span
                              class={cn(
                                "grid size-3.5 place-items-center rounded border border-foreground/40",
                                selected &&
                                  "border-foreground bg-foreground text-background",
                              )}
                            >
                              {selected && <Check class="size-3" />}
                            </span>
                          ) : (
                            optionIndex + 1
                          )}
                        </span>
                        <span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 break-words">
                          <span class="text-sm font-medium leading-6">
                            {display.label}
                          </span>
                          {display.recommended && (
                            <span class="rounded-md bg-primary/20 px-1 text-[11px] font-semibold leading-[18px]">
                              {copy.recommended}
                            </span>
                          )}
                          {option.description !== null && (
                            <span class="text-xs leading-6 text-muted-foreground">
                              {option.description}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                  <div
                    class={cn(
                      "mt-1 flex items-start gap-2 rounded-xl border p-2",
                      _question.options.length === 0 ||
                        draft.value.custom !== ""
                        ? "border-border"
                        : "border-transparent",
                    )}
                  >
                    {_question.options.length > 0 && (
                      <span
                        aria-hidden="true"
                        class="mt-1 grid size-5 shrink-0 place-items-center text-muted-foreground"
                      >
                        {_question.multi_select ? (
                          <span
                            class={cn(
                              "grid size-3.5 place-items-center rounded border border-foreground/40",
                              draft.value.custom.trim() !== "" &&
                                "border-foreground bg-foreground text-background",
                            )}
                          >
                            {draft.value.custom.trim() !== "" && (
                              <Check class="size-3" />
                            )}
                          </span>
                        ) : (
                          <Pencil class="size-3" />
                        )}
                      </span>
                    )}
                    <div class="grid min-w-0 flex-1 text-sm leading-6">
                      <div
                        aria-hidden="true"
                        class="pointer-events-none invisible col-start-1 row-start-1 max-h-36 min-h-6 overflow-hidden break-words whitespace-pre-wrap"
                      >{`${draft.value.custom}\n`}</div>
                      <Textarea
                        key={_question.id}
                        value={draft.value.custom}
                        rows={1}
                        maxlength={32768}
                        aria-label={copy.customLabel}
                        autofocus={
                          _question.options.length === 0 &&
                          !focused.value.has(index.value)
                        }
                        class="col-start-1 row-start-1 h-full max-h-36 min-h-6 resize-none rounded-none border-0 bg-transparent p-0 text-sm leading-6 shadow-none focus-visible:ring-0"
                        disabled={_busy}
                        placeholder={copy.customPlaceholder}
                        onFocus={() => focused.value.add(index.value)}
                        onInput={(event) =>
                          change((current) => ({
                            ...current,
                            selected: _question.multi_select
                              ? current.selected
                              : [],
                            custom: (event.target as HTMLInputElement).value,
                            skipped: false,
                          }))
                        }
                        onKeydown={keyDown}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <footer class="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pt-1.5">
                <div class="flex items-center gap-1.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    class="size-6"
                    aria-label={copy.previous}
                    disabled={_busy || index.value === 0}
                    onClick={() => replace(drafts.value, index.value - 1)}
                  >
                    <ChevronLeft class="size-4" />
                  </Button>
                  <span class="text-sm text-muted-foreground">
                    {index.value + 1} / {drafts.value.length}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="size-6"
                    aria-label={copy.nextQuestion}
                    disabled={_busy || index.value === drafts.value.length - 1}
                    onClick={() => replace(drafts.value, index.value + 1)}
                  >
                    <ChevronRight class="size-4" />
                  </Button>
                </div>
                <div class="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={_busy}
                    onClick={skip}
                  >
                    {copy.skip}
                  </Button>
                  <Button
                    size="sm"
                    disabled={_busy || !answered(draft.value)}
                    onClick={next}
                  >
                    {_busy
                      ? copy.submitting
                      : index.value === drafts.value.length - 1
                        ? copy.submit
                        : copy.continue}
                  </Button>
                </div>
              </footer>
            </>
          )}
          {(error.value ?? _remoteError ?? draftState.error) !== null && (
            <p role="alert" class="px-6 pt-2 text-xs text-destructive">
              {error.value ?? _remoteError ?? draftState.error}
            </p>
          )}
        </section>
      );
    };
  },
  {
    name: "QuestionFlow",
    inheritAttrs: false,
    props: ["question", "busy", "error", "onResetError", "onDecide"],
  },
);
