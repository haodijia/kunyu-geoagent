interface SearchBase {
  readonly total: number;
  readonly truncated: boolean;
  readonly artifact_path: string | null;
}
export type SearchResult = SearchBase & (
  { readonly shape: "paths"; readonly paths: readonly string[] }
  | { readonly shape: "matches"; readonly files: readonly { readonly path: string; readonly matches: readonly { readonly lineNumber: number; readonly line: string }[] }[] }
);

export function parseSearchResult(value: unknown): SearchResult {
  if (!record(value) || !Number.isSafeInteger(value.total) || (value.total as number) < 0
    || typeof value.truncated !== "boolean"
    || !(value.artifact_path === null || (typeof value.artifact_path === "string" && value.artifact_path.startsWith("/workspace/.kunyu-search/")))) throw new Error("Invalid search result metadata.");
  let kept = 0;
  if (value.shape === "paths" && Array.isArray(value.paths)) {
    if (value.paths.length > 100 || !value.paths.every(path)) throw new Error("Invalid search path page.");
    kept = value.paths.length;
  } else if (value.shape === "matches" && Array.isArray(value.files)) {
    const names = new Set();
    for (const file of value.files) {
      if (!record(file) || !path(file.path) || names.has(file.path) || !Array.isArray(file.matches) || file.matches.length === 0) throw new Error("Invalid search file group.");
      names.add(file.path);
      for (const match of file.matches) {
        if (!record(match) || !Number.isSafeInteger(match.lineNumber) || (match.lineNumber as number) < 1 || typeof match.line !== "string"
          || new TextEncoder().encode(match.line).length > 2000 + " (line truncated)".length) throw new Error("Invalid search match.");
        kept++;
      }
    }
    if (kept > 250) throw new Error("Search match page exceeds its cap.");
  } else throw new Error("Unknown search result shape.");
  if (kept > (value.total as number) || (value.total !== 0 && kept === 0) || (!value.truncated && kept !== value.total)) throw new Error("Inconsistent search omission count.");
  return value as unknown as SearchResult;
}

function path(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") && value !== ".." && !value.startsWith("../");
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
