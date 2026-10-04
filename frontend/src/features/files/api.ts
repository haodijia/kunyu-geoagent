import { requestBlob, requestJson } from "@/api/client";

export interface FilePreview {
  readonly path: string;
  readonly version: string;
  readonly bytes: number;
  readonly kind: "markdown" | "html" | "code" | "image" | "unsupported";
  readonly state: "ready" | "oversized" | "unsupported";
  readonly threshold_bytes: number | null;
  readonly text: string | null;
}

const endpoint = (sessionId: string, action: string, path: string) => `/api/v1/sessions/${encodeURIComponent(sessionId)}/files/${action}?path=${encodeURIComponent(path)}`;

export async function readFilePreview(sessionId: string, path: string, signal: AbortSignal): Promise<FilePreview> {
  const value = await requestJson<FilePreview>(endpoint(sessionId, "preview", path), { signal });
  if (typeof value.path !== "string" || typeof value.version !== "string" || !value.version
    || !Number.isSafeInteger(value.bytes) || value.bytes < 0
    || !["markdown", "html", "code", "image", "unsupported"].includes(value.kind)
    || !["ready", "oversized", "unsupported"].includes(value.state)
    || !(value.threshold_bytes === null || (Number.isSafeInteger(value.threshold_bytes) && value.threshold_bytes > 0))
    || !(value.text === null || typeof value.text === "string")
    || ((value.state === "ready" && value.kind !== "image") !== (typeof value.text === "string"))) throw new Error("Invalid file preview payload.");
  return value;
}

export function readFileImage(sessionId: string, preview: FilePreview, signal: AbortSignal): Promise<Blob> {
  return requestBlob(`${endpoint(sessionId, "image", preview.path)}&version=${encodeURIComponent(preview.version)}`, signal);
}

export function downloadFile(sessionId: string, path: string): Promise<Blob> {
  return requestBlob(endpoint(sessionId, "download", path));
}

export interface DirectoryEntry { readonly name: string; readonly type: "file" | "directory" | "other"; readonly size: number | null; }
export interface DirectoryListing { readonly path: string; readonly entries: readonly DirectoryEntry[]; readonly truncated: boolean; }

export async function listDirectory(sessionId: string, path: string, signal: AbortSignal): Promise<DirectoryListing> {
  const value = await requestJson<DirectoryListing>(endpoint(sessionId, "list", path), { signal });
  if (value.path !== path || !Array.isArray(value.entries) || typeof value.truncated !== "boolean"
    || value.entries.some(entry => typeof entry.name !== "string" || entry.name === "" || /[\/\x00]/.test(entry.name) || [".", ".."].includes(entry.name)
      || !["file", "directory", "other"].includes(entry.type)
      || !(entry.size === null || (entry.type === "file" && Number.isSafeInteger(entry.size) && entry.size >= 0)))
    || new Set(value.entries.map(entry => entry.name)).size !== value.entries.length) throw new Error("Invalid directory listing payload.");
  return value;
}

export const directoryQueryKey = (sessionId: string, path?: string) => path === undefined ? ["workspace-files", sessionId] as const : ["workspace-files", sessionId, path] as const;
