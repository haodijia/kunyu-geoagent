import { requestJson } from "@/api/client";
import { zhCN } from "@/locales/zh-CN";

export const maxWorkspaceFileBytes = 64 * 1024 * 1024;

export interface WorkspaceFile {
  readonly name: string;
  readonly file_path: string;
  readonly bytes: number;
  readonly kind: "file" | "image";
}

export async function uploadWorkspaceFile(workspaceId: string, file: File, signal: AbortSignal): Promise<WorkspaceFile> {
  if (file.size > maxWorkspaceFileBytes) throw new Error(zhCN.workspaceFiles.tooLarge);
  const kind = file.type.startsWith("image/") ? "image" : "file";
  const query = new URLSearchParams({ name: file.name, kind });
  const result = await requestJson<unknown>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/files?${query}`, {
    method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file, signal,
  });
  const folder = kind === "image" ? "images" : "data";
  if (typeof result !== "object" || result === null || !("kind" in result) || !("bytes" in result) || !("name" in result) || !("file_path" in result)
    || result.kind !== kind || result.bytes !== file.size || typeof result.name !== "string" || result.name.length === 0 || /[/\\\x00-\x1f\x7f]/.test(result.name)
    || result.file_path !== `/workspace/${folder}/${result.name}`) {
    throw new Error(zhCN.workspaceFiles.invalidReceipt);
  }
  return { name: result.name, file_path: result.file_path as string, bytes: file.size, kind };
}
