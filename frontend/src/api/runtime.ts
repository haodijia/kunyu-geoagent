export class RuntimeConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeConnectionError";
  }
}

export function getRuntimeConnection(): Window["kunyu"] {
  if (!("kunyu" in window)) {
    throw new RuntimeConnectionError(
      "桌面运行时连接不可用。"
    );
  }

  return window.kunyu;
}
