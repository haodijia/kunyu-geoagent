import { contextBridge, ipcRenderer } from "electron";

const FAILURE_CHANNEL = "diagnostics:get-backend-failure";
const RETRY_CHANNEL = "diagnostics:retry-backend";

interface BackendFailure {
  readonly type: string;
  readonly message: string;
  readonly exitCode: number | null;
  readonly logs: readonly string[];
}

const failure = readFailure();

contextBridge.exposeInMainWorld(
  "kunyuDiagnostics",
  Object.freeze({
    failure,
    retry: () => ipcRenderer.invoke(RETRY_CHANNEL)
  })
);

function readFailure(): Readonly<BackendFailure> {
  const value: unknown = ipcRenderer.sendSync(FAILURE_CHANNEL);
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    typeof value.type !== "string" ||
    !("message" in value) ||
    typeof value.message !== "string" ||
    !("exitCode" in value) ||
    (value.exitCode !== null && typeof value.exitCode !== "number") ||
    !("logs" in value) ||
    !Array.isArray(value.logs) ||
    !value.logs.every((line) => typeof line === "string")
  ) {
    throw new Error("Backend diagnostics are unavailable.");
  }

  return Object.freeze({
    type: value.type,
    message: value.message,
    exitCode: value.exitCode,
    logs: Object.freeze([...value.logs])
  });
}
