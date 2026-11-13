import type { HumanQuestion } from "@/features/questions/api";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import {
  computed,
  shallowReactive,
  shallowRef,
  toValue,
  type MaybeRefOrGetter,
} from "vue";
export interface AnswerDraft {
  readonly selected: readonly string[];
  readonly custom: string;
  readonly skipped: boolean;
}
interface Progress {
  readonly index: number;
  readonly drafts: readonly AnswerDraft[];
}
const empty = (question: HumanQuestion): Progress => ({
  index: 0,
  drafts: question.questions.map(() => ({
    selected: [],
    custom: "",
    skipped: false,
  })),
});
function valid(value: unknown, question: HumanQuestion): value is Progress {
  if (typeof value !== "object" || value === null) return false;
  const progress = value as Partial<Progress>;
  return (
    Number.isInteger(progress.index) &&
    (progress.index as number) >= 0 &&
    (progress.index as number) < question.questions.length &&
    Array.isArray(progress.drafts) &&
    progress.drafts.length === question.questions.length &&
    progress.drafts.every((draft: unknown, i: number) => {
      if (typeof draft !== "object" || draft === null) return false;
      const item = draft as Partial<AnswerDraft>,
        source = question.questions[i];
      return (
        source !== undefined &&
        typeof item.custom === "string" &&
        item.custom.length <= 32768 &&
        typeof item.skipped === "boolean" &&
        Array.isArray(item.selected) &&
        new Set(item.selected).size === item.selected.length &&
        item.selected.every(
          (label: unknown) =>
            typeof label === "string" &&
            source.options.some((option) => option.label === label),
        ) &&
        (source.multi_select ||
          (item.selected.length <= 1 &&
            (item.custom.trim() === "" || item.selected.length === 0))) &&
        (!item.skipped || (item.selected.length === 0 && item.custom === ""))
      );
    })
  );
}
export function useQuestionDraft(question: MaybeRefOrGetter<HumanQuestion>) {
  const key = computed(
    () =>
      `kunyu.questions.${toValue(question).session_id}.${toValue(question).id}`,
  );
  const state = shallowRef<{
      progress: Progress | null;
      error: string | null;
    }>(
      (() => {
        try {
          const raw = sessionStorage.getItem(key.value);
          if (raw === null)
            return {
              progress: empty(toValue(question)),
              error: null,
            };
          const value: unknown = JSON.parse(raw);
          if (!valid(value, toValue(question)))
            throw new Error("Invalid question draft.");
          return {
            progress: value,
            error: null,
          };
        } catch (error) {
          console.error("[questions] Failed to restore answer draft.", {
            id: toValue(question).id,
            error,
          });
          return {
            progress: null,
            error: zhCN.questions.draftReadFailed,
          };
        }
      })(),
    ),
    setState = refSetter(state);
  function replace(index: number, drafts: readonly AnswerDraft[]) {
    const progress = {
      index,
      drafts,
    };
    if (!valid(progress, toValue(question)))
      throw new Error("Invalid question progress.");
    try {
      sessionStorage.setItem(key.value, JSON.stringify(progress));
      setState({
        progress,
        error: null,
      });
      return true;
    } catch (error) {
      console.error("[questions] Failed to save answer draft.", {
        id: toValue(question).id,
        error,
      });
      setState((current) => ({
        ...current,
        error: zhCN.questions.draftWriteFailed,
      }));
      return false;
    }
  }
  function reset() {
    try {
      sessionStorage.removeItem(key.value);
      setState({
        progress: empty(toValue(question)),
        error: null,
      });
    } catch (error) {
      console.error("[questions] Failed to reset answer draft.", {
        id: toValue(question).id,
        error,
      });
      setState((current) => ({
        ...current,
        error: zhCN.questions.draftWriteFailed,
      }));
    }
  }
  function clear() {
    sessionStorage.removeItem(key.value);
  }
  return shallowReactive({
    get progress() {
      return state.value.progress;
    },
    get error() {
      return state.value.error;
    },
    get replace() {
      return replace;
    },
    get reset() {
      return reset;
    },
    get clear() {
      return clear;
    },
  });
}
