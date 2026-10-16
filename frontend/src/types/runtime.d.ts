export interface KunyuRuntimeConnection {
  readonly baseUrl: string;
  readonly apiVersion: "1";
  readonly sessionToken: string;
}

export interface StorageInfo { readonly dataDirectory: string; readonly runtimeDirectory: string; }
export type StorageResult<T> = { ok: true; value: T } | { ok: false; code: string };

declare global {
  interface Window {
    readonly kunyu: {
      readonly getConnection: () => KunyuRuntimeConnection;
      readonly storage: {
        status(): Promise<StorageResult<StorageInfo>>;
        choose(): Promise<StorageResult<string | null>>;
        migrate(): Promise<StorageResult<StorageInfo>>;
      };
    };
  }
}

export {};
