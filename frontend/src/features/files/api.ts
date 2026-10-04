import { requestBlob, requestJson, streamEvents } from "@/api/client";

export interface FilePreview {
  readonly path: string;
  readonly version: string;
  readonly bytes: number;
  readonly kind: "markdown" | "html" | "code" | "image" | "unsupported";
  readonly state: "ready" | "oversized" | "unsupported";
  readonly threshold_bytes: number | null;
  readonly text: string | null;
  readonly editable: boolean;
}

const endpoint = (sessionId: string, action: string, path: string) => `/api/v1/sessions/${encodeURIComponent(sessionId)}/files/${action}?path=${encodeURIComponent(path)}`;

export async function readFilePreview(sessionId: string, path: string, signal: AbortSignal): Promise<FilePreview> {
  const value = await requestJson<FilePreview>(endpoint(sessionId, "preview", path), { signal });
  if (typeof value.path !== "string" || typeof value.version !== "string" || !value.version
    || typeof value.editable !== "boolean" || (value.editable && (value.state !== "ready" || !["code", "markdown", "html"].includes(value.kind)))
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

export interface FileInfo { readonly version: string; readonly kind: "file" | "directory" | "other"; readonly size: number | null; }
export interface FileWatchFrame { readonly path: string; readonly kind: "ready" | "change"; readonly info: FileInfo | null; }

export interface FileWatchFailure { readonly path: string; readonly kind: "error"; readonly code: string; readonly message: string; }
export type FileWatchEvent = FileWatchFrame | FileWatchFailure;

export async function* streamFileChanges(sessionId: string, paths: readonly string[], signal: AbortSignal): AsyncGenerator<FileWatchEvent> {
  const states = new Map<string, "connecting" | "connected" | "failed">(paths.map(path => [path, "connecting"]));
  for await (const event of streamEvents(`/api/v1/sessions/${encodeURIComponent(sessionId)}/files/changes`, signal, undefined, { method: "POST", body: JSON.stringify({ paths }) })) {
    const value = JSON.parse(event.data) as unknown;
    if (typeof value !== "object" || value === null || !("path" in value) || typeof value.path !== "string"
      || !states.has(value.path) || states.get(value.path) === "failed") throw new Error("Invalid file watch frame.");
    if (event.event === "file.error") {
      const failure = value as FileWatchFailure;
      if (failure.kind !== "error" || typeof failure.code !== "string" || !failure.code || typeof failure.message !== "string") throw new Error("Invalid file watch failure.");
      states.set(value.path, "failed");
      yield failure;
      continue;
    }
    const frame = value as FileWatchFrame;
    if (!(frame.kind === "ready" || frame.kind === "change") || event.event !== `file.${frame.kind}`
      || (frame.kind === "ready" ? states.get(frame.path) !== "connecting" : states.get(frame.path) !== "connected")
      || !(frame.info === null || (typeof frame.info === "object" && frame.info !== undefined && typeof frame.info.version === "string" && frame.info.version !== "" && ["file", "directory", "other"].includes(frame.info.kind)
        && (frame.info.size === null || (frame.info.kind === "file" && Number.isSafeInteger(frame.info.size) && frame.info.size >= 0))))) throw new Error("Invalid file watch frame.");
    states.set(frame.path, "connected");
    yield frame;
  }
  if (!signal.aborted && [...states.values()].some(state => state !== "failed")) throw new Error("The file watch ended; reconnect to resume notifications.");
}

export async function saveFile(sessionId: string, path: string, text: string, version: string, signal: AbortSignal): Promise<FilePreview> {
  const value = await requestJson<FilePreview>(endpoint(sessionId, "content", path), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, version }), signal });
  if (value.path !== path || value.text !== text || typeof value.version !== "string" || !value.version
    || value.editable !== true || value.state !== "ready" || !["code", "markdown", "html"].includes(value.kind)
    || !Number.isSafeInteger(value.bytes) || value.bytes !== new TextEncoder().encode(text).length
    || value.threshold_bytes !== 1024 * 1024) throw new Error("Invalid saved file preview payload.");
  return value;
}
