import { diffLines } from "diff";

export interface FileDiff {
  readonly path: string;
  readonly old_text: string | null;
  readonly new_text: string;
}

export interface FileMutationResult {
  readonly path: string;
  readonly operation: "create" | "update";
  readonly diffs: readonly FileDiff[];
}

export function parseFileMutationResult(value: unknown): FileMutationResult {
  if (!record(value) || typeof value.path !== "string"
    || (value.operation !== "create" && value.operation !== "update")
    || !Array.isArray(value.diffs)) throw new Error("Invalid file mutation result metadata.");
  for (const diff of value.diffs) {
    if (!record(diff) || diff.path !== value.path
      || (diff.old_text !== null && typeof diff.old_text !== "string")
      || typeof diff.new_text !== "string") throw new Error("Invalid applied file diff.");
  }
  return value as unknown as FileMutationResult;
}

export function diffRows(diff: FileDiff) {
  return diffLines(diff.old_text === null ? "" : diff.old_text, diff.new_text).flatMap((change) => {
    const lines = change.value.split("\n");
    if (lines.at(-1) === "") lines.pop();
    return lines.map((text) => ({ text, kind: change.added ? "addition" as const : change.removed ? "deletion" as const : "context" as const }));
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
