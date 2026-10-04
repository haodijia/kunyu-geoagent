/** Canonical content is ordered by first-seen block, independent of delta arrival. */
export type ContentBlock =
  | { readonly type: "text" | "reasoning"; readonly text: string }
  | {
      readonly type: "tool-call";
      readonly id: string;
      readonly name: string;
      readonly arguments: string;
    };
export interface ReplayEnvelope {
  readonly response: unknown;
  readonly blocks: readonly unknown[] | null;
}
export function parseContentBlocks(value: unknown): readonly ContentBlock[] {
  if (!Array.isArray(value) || !value.every(validContentBlock))
    throw new Error("Invalid canonical assistant content.");
  return value as readonly ContentBlock[];
}
export function validContentBlock(value: unknown): boolean {
  if (!object(value)) return false;
  if (value.type === "text" || value.type === "reasoning")
    return typeof value.text === "string";
  return (
    value.type === "tool-call" &&
    identity(value.id) &&
    identity(value.name) &&
    typeof value.arguments === "string"
  );
}
export function validReplayEnvelope(value: unknown): boolean {
  return (
    value === null ||
    (object(value) &&
      "response" in value &&
      (value.blocks === null || Array.isArray(value.blocks)))
  );
}
export function contentText(
  blocks: readonly ContentBlock[],
  reasoning = false,
): string {
  return blocks
    .map((block) =>
      block.type === (reasoning ? "reasoning" : "text") ? block.text : "",
    )
    .join("");
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function identity(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}
