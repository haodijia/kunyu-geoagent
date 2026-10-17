import { parseAttachments, type Attachment } from "@/features/attachments/api";

export type ToolContentBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly attachment: Extract<Attachment, { readonly kind: "image" }>; readonly offloaded: null };

/** Tool facts contain fresh images; request-specific offload marks live in separate events. */
export function parseToolContent(value: unknown): readonly ToolContentBlock[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Tool result has no canonical content.");
  const images: unknown[] = [];
  for (const block of value) {
    if (block === null || typeof block !== "object") throw new Error("Invalid tool content block.");
    if (block.type === "text" && typeof block.text === "string") continue;
    if (block.type !== "image" || block.offloaded !== null || block.attachment?.kind !== "image") throw new Error("Invalid tool image block.");
    images.push(block.attachment);
  }
  const refs = parseAttachments(images);
  if (refs.reduce((total, ref) => total + ref.bytes, 0) > 32 * 1024 * 1024) throw new Error("Tool images exceed the result byte limit.");
  return value;
}

export function toolContentImages(blocks: readonly ToolContentBlock[]) {
  return blocks.flatMap((block) => block.type === "image" ? [block.attachment] : []);
}

export function toolContentText(blocks: readonly ToolContentBlock[]): string {
  return blocks.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
}
