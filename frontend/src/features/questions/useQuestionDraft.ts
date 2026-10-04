import { useState } from "react";
import type { HumanQuestion } from "./api";
import { zhCN } from "@/locales/zh-CN";

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
export function useQuestionDraft(question: HumanQuestion) {
  const key = `kunyu.questions.${question.session_id}.${question.id}`;
  const [state, setState] = useState<{
    progress: Progress | null;
    error: string | null;
  }>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw === null) return { progress: empty(question), error: null };
      const value: unknown = JSON.parse(raw);
      if (!valid(value, question)) throw new Error("Invalid question draft.");
      return { progress: value, error: null };
    } catch (error) {
      console.error("[questions] Failed to restore answer draft.", {
        id: question.id,
        error,
      });
      return { progress: null, error: zhCN.questions.draftReadFailed };
    }
  });
  function replace(index: number, drafts: readonly AnswerDraft[]) {
    const progress = { index, drafts };
    if (!valid(progress, question))
      throw new Error("Invalid question progress.");
    try {
      sessionStorage.setItem(key, JSON.stringify(progress));
      setState({ progress, error: null });
      return true;
    } catch (error) {
      console.error("[questions] Failed to save answer draft.", {
        id: question.id,
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
      sessionStorage.removeItem(key);
      setState({ progress: empty(question), error: null });
    } catch (error) {
      console.error("[questions] Failed to reset answer draft.", {
        id: question.id,
        error,
      });
      setState((current) => ({
        ...current,
        error: zhCN.questions.draftWriteFailed,
      }));
    }
  }
  function clear() {
    sessionStorage.removeItem(key);
  }
  return { ...state, replace, reset, clear };
}
