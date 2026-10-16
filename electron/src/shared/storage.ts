export const STORAGE_CHANNEL = "storage:action";
export interface StorageInfo {
  readonly dataDirectory: string;
  readonly runtimeDirectory: string;
}
export type StorageRequest = { action: "status" | "choose" | "migrate" };
export type StorageResult<T> = { ok: true; value: T } | { ok: false; code: string };
