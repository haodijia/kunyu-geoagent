import { zhCN } from "@/locales/zh-CN";

export class RuntimeConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeConnectionError";
  }
}

export function getRuntimeConnection(): Window["kunyu"] {
  if (!("kunyu" in window)) {
    throw new RuntimeConnectionError(
      zhCN.api.runtimeUnavailable
    );
  }

  return window.kunyu;
}
