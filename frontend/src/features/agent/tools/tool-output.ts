import { parseAttachments, type Attachment } from "@/features/attachments/api";
import type { ToolContentBlock } from "@/features/agent/tools/tool-content";

type Image = Extract<Attachment, { readonly kind: "image" }>;
export type ToolDisplay = { readonly summary: string } & (
  | { readonly kind: "text" | "code"; readonly text: string }
  | { readonly kind: "read" | "search" | "file_change" | "image_read" | "todos"; readonly data: unknown; readonly text: string; readonly images: readonly Image[] }
  | { readonly kind: "images"; readonly images: readonly Image[]; readonly description: string }
  | { readonly kind: "analysis"; readonly job_id: string }
  | { readonly kind: "none" | "subagent" }
);

export interface ToolCompaction {
  readonly summary: string;
  readonly content: readonly ToolContentBlock[];
}

export function parseToolDisplay(value: unknown): ToolDisplay {
  if (value === null || typeof value !== "object" || !("kind" in value) || !("summary" in value) || typeof value.summary !== "string" || !value.summary)
    throw new Error("Tool result has no frontend projection.");
  const summary = value.summary;
  switch (value.kind) {
    case "none": case "subagent": return { kind: value.kind, summary };
    case "text": case "code":
      if (!("text" in value) || typeof value.text !== "string") break;
      return { kind: value.kind, summary, text: value.text };
    case "analysis":
      if (!("job_id" in value) || typeof value.job_id !== "string" || !value.job_id) break;
      return { kind: "analysis", summary, job_id: value.job_id };
    case "images": {
      if (!("images" in value) || !("description" in value) || typeof value.description !== "string") break;
      const images = parseImages(value.images);
      if (images.length === 0) break;
      return { kind: "images", summary, images, description: value.description };
    }
    case "read": case "search": case "file_change": case "image_read": case "todos":
      if (!("data" in value) || !("text" in value) || typeof value.text !== "string" || !("images" in value)) break;
      return { kind: value.kind, summary, data: value.data, text: value.text, images: parseImages(value.images) };
  }
  throw new Error("Invalid tool frontend projection.");
}

function parseImages(value: unknown): readonly Image[] {
  const images = parseAttachments(value);
  if (images.some(image => image.kind !== "image")) throw new Error("Tool image presentation contains a file.");
  return images as readonly Image[];
}
