import { diffLines } from "diff";

export interface FileMutationResult {
  readonly path: string;
  readonly operation: "create" | "update";
  readonly before: string | null;
  readonly after: string;
}

export function parseFileMutationResult(value: unknown): FileMutationResult {
  if (!record(value) || typeof value.path !== "string"
    || (value.operation !== "create" && value.operation !== "update")
    || (value.before !== null && typeof value.before !== "string")
    || typeof value.after !== "string") throw new Error("Invalid file mutation result.");
  return value as unknown as FileMutationResult;
}

export function diffRows(result: FileMutationResult) {
  return diffLines(result.before === null ? "" : result.before, result.after).flatMap((change) => {
    const lines = change.value.split("\n");
    if (lines.at(-1) === "") lines.pop();
    return lines.map((text) => ({ text, kind: change.added ? "addition" as const : change.removed ? "deletion" as const : "context" as const }));
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
