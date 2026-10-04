export interface ReadResult {
  readonly path: string;
  readonly offset: number;
  readonly lines: readonly { readonly number: number; readonly text: string }[];
  readonly total_lines: number;
  readonly truncated_by_bytes: boolean;
  readonly lang?: string;
}

export function parseReadResult(value: unknown): ReadResult {
  if (!record(value) || typeof value.path !== "string" || !integer(value.offset, 1)
    || !integer(value.total_lines, 0) || typeof value.truncated_by_bytes !== "boolean"
    || !Array.isArray(value.lines) || value.lines.length > 2000
    || (value.lang !== undefined && typeof value.lang !== "string")) throw new Error("Invalid read result metadata.");
  let bytes = 0;
  for (const [index, line] of value.lines.entries()) {
    if (!record(line) || line.number !== (value.offset as number) + index
      || (line.number as number) > (value.total_lines as number) || typeof line.text !== "string") throw new Error("Invalid read result line window.");
    bytes += new TextEncoder().encode(line.text).length + (index > 0 ? 1 : 0);
  }
  if (bytes > 50 * 1024 || (value.lines.length === 0 && value.total_lines !== 0)
    || ((value.offset as number) > (value.total_lines as number) && !(value.offset === 1 && value.total_lines === 0))) throw new Error("Read result exceeds its line or byte boundary.");
  return value as unknown as ReadResult;
}

function integer(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
