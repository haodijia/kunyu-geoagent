import type { KunyuRuntimeConnection } from "@/types/runtime";
import { zhCN } from "@/locales/zh-CN";

export class RuntimeConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeConnectionError";
  }
}

export function getRuntimeConnection(): KunyuRuntimeConnection {
  if (!("kunyu" in window)) {
    throw new RuntimeConnectionError(
      zhCN.api.runtimeUnavailable
    );
  }

  return window.kunyu.getConnection();
}
