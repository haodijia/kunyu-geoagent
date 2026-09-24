interface KunyuRuntimeConnection {
  readonly baseUrl: string;
  readonly apiVersion: "1";
  readonly sessionToken: string;
}

declare global {
  interface Window {
    readonly kunyu: Readonly<KunyuRuntimeConnection>;
  }
}

export {};
