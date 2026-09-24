import { contextBridge, ipcRenderer } from "electron";

const RUNTIME_CONNECTION_CHANNEL = "runtime:get-connection";

interface RuntimeConnection {
  readonly baseUrl: string;
  readonly apiVersion: "1";
  readonly sessionToken: string;
}

const runtimeConnection = readRuntimeConnection();

contextBridge.exposeInMainWorld("kunyu", runtimeConnection);

function readRuntimeConnection(): RuntimeConnection {
  const value: unknown = ipcRenderer.sendSync(RUNTIME_CONNECTION_CHANNEL);
  if (
    typeof value !== "object" ||
    value === null ||
    !("baseUrl" in value) ||
    typeof value.baseUrl !== "string" ||
    !("apiVersion" in value) ||
    value.apiVersion !== "1" ||
    !("sessionToken" in value) ||
    typeof value.sessionToken !== "string" ||
    value.sessionToken.length === 0
  ) {
    throw new Error("Runtime connection is unavailable.");
  }

  return Object.freeze({
    baseUrl: value.baseUrl,
    apiVersion: value.apiVersion,
    sessionToken: value.sessionToken
  });
}
