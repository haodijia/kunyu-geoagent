import type { AttachmentUpload } from "./api";

export const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export async function prepareAttachment(file: File): Promise<AttachmentUpload> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768)
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  const isImage = IMAGE_TYPES.has(file.type);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    kind: isImage ? "image" : "file",
    media_type: isImage ? file.type : null,
    data_base64: btoa(parts.join("")),
  };
}
