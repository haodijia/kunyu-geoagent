import { requestBlob, requestJson } from "@/api/client";

export type Attachment = {
  readonly id: string;
  readonly name: string;
  readonly bytes: number;
} & (
  | { readonly kind: "file" }
  | {
      readonly kind: "image";
      readonly media_type: "image/png" | "image/jpeg";
      readonly width: number;
      readonly height: number;
      readonly original_width: number;
      readonly original_height: number;
    }
);

export interface AttachmentUpload {
  readonly id: string;
  readonly kind: "image" | "file";
  readonly name: string;
  readonly media_type: string | null;
  readonly data_base64: string;
}

export async function uploadAttachments(sessionId: string, items: readonly AttachmentUpload[], signal: AbortSignal): Promise<readonly Attachment[]> {
  const refs = parseAttachments(await requestJson<unknown>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/attachments`, {
    method: "POST", body: JSON.stringify({ items }), signal,
  }));
  if (refs.length !== items.length || refs.some((ref, index) => ref.id !== items[index]?.id)) throw new Error("Attachment receipts do not match their upload identities.");
  return refs;
}

export function readAttachment(sessionId: string, id: string, signal?: AbortSignal): Promise<Blob> {
  return requestBlob(`/api/v1/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(id)}`, signal);
}

export function parseAttachments(value: unknown): readonly Attachment[] {
  if (!Array.isArray(value) || value.length > 8 || !value.every(validAttachment) || new Set(value.map((ref) => ref.id)).size !== value.length) throw new Error("Invalid attachment receipts.");
  return value;
}

export function validAttachment(value: unknown): value is Attachment {
  if (value === null || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;
  if (typeof ref.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ref.id) || typeof ref.name !== "string" || ref.name.length === 0 || !Number.isSafeInteger(ref.bytes) || (ref.bytes as number) < 0 || (ref.bytes as number) > 16 * 1024 * 1024) return false;
  if (ref.kind === "file") return true;
  return ref.kind === "image" && ["image/png", "image/jpeg"].includes(String(ref.media_type)) && [ref.width, ref.height, ref.original_width, ref.original_height].every((size) => Number.isSafeInteger(size) && (size as number) > 0);
}
