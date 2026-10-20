import { requestBlob, requestJson } from "@/api/client";
import { zhCN } from "@/locales/zh-CN";

export const maxWorkspaceFileBytes = 64 * 1024 * 1024;

export interface WorkspaceFile {
  readonly name: string;
  readonly file_path: string;
  readonly bytes: number;
  readonly kind: "file" | "image";
}

export interface WorkspaceEntry {
  readonly name: string;
  readonly file_path: string;
  readonly kind: "file" | "directory";
  readonly bytes: number | null;
  readonly media_type: string | null;
  readonly modified_at: string;
}

export interface WorkspaceListing {
  readonly file_path: string;
  readonly entries: readonly WorkspaceEntry[];
}

const filesPath = (workspaceId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/files`;

export const workspaceFileKeys = {
  directory: (workspaceId: string, path: string) =>
    ["workspace-files", workspaceId, path] as const,
};

export function listWorkspaceFiles(
  workspaceId: string,
  path: string,
  signal: AbortSignal,
): Promise<WorkspaceListing> {
  return requestJson(
    `${filesPath(workspaceId)}?${new URLSearchParams({ file_path: path })}`,
    { signal },
  );
}

export function readWorkspaceFile(
  workspaceId: string,
  path: string,
  signal?: AbortSignal,
  maxBytes?: number,
): Promise<Blob> {
  const query = new URLSearchParams({ file_path: path });
  if (maxBytes !== undefined) query.set("max_bytes", String(maxBytes));
  return requestBlob(`${filesPath(workspaceId)}/content?${query}`, signal);
}

export async function uploadWorkspaceFile(
  workspaceId: string,
  file: File,
  signal: AbortSignal,
): Promise<WorkspaceFile> {
  if (file.size > maxWorkspaceFileBytes)
    throw new Error(zhCN.workspaceFiles.tooLarge);
  const kind = file.type.startsWith("image/") ? "image" : "file";
  const query = new URLSearchParams({ name: file.name, kind });
  const result = await requestJson<unknown>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/files?${query}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
      signal,
    },
  );
  const folder = "files";
  if (
    typeof result !== "object" ||
    result === null ||
    !("kind" in result) ||
    !("bytes" in result) ||
    !("name" in result) ||
    !("file_path" in result) ||
    result.kind !== kind ||
    result.bytes !== file.size ||
    typeof result.name !== "string" ||
    result.name.length === 0 ||
    /[/\\\x00-\x1f\x7f]/.test(result.name) ||
    result.file_path !== `/workspace/${folder}/${result.name}`
  ) {
    throw new Error(zhCN.workspaceFiles.invalidReceipt);
  }
  return {
    name: result.name,
    file_path: result.file_path as string,
    bytes: file.size,
    kind,
  };
}
