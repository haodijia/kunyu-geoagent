import { ApiError } from "@/api/client";
import { zhCN } from "@/locales/zh-CN";
import type { ModelConnection } from "./api";

export type ConnectionTone = "ready" | "attention" | "muted" | "busy";

export function connectionStatus(connection: ModelConnection): {
  readonly tone: ConnectionTone;
  readonly label: string;
} {
  const content = zhCN.modelConnections.status;
  if (
    connection.management_status !== "ready" ||
    connection.discovery.status === "pending"
  ) {
    return { tone: "busy", label: content.managing };
  }
  if (!connection.enabled) {
    return { tone: "muted", label: content.disabled };
  }
  if (connection.credential.status !== "ready") {
    return { tone: "attention", label: content.credentialRequired };
  }
  if (
    connection.discovery.status === "failed" ||
    connection.discovery.status === "interrupted"
  ) {
    return { tone: "attention", label: content.discoveryFailed };
  }
  const usable = connection.entries.some(
    (entry) =>
      entry.revision === connection.revision &&
      entry.availability === "available" &&
      entry.enabled &&
      entry.checks.text.status === "passed" &&
      entry.checks.tools.status === "passed"
  );
  if (!usable) {
    return { tone: "attention", label: content.needsSetup };
  }
  return { tone: "ready", label: content.ready };
}

export function connectionErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return zhCN.modelConnections.errors.unknown;
  }
  const code = readErrorCode(error.details);
  const messages: Readonly<Record<string, string>> = zhCN.modelConnections.errors.byCode;
  return messages[code] ??
    zhCN.modelConnections.errors.requestFailed(error.status);
}

export function providerErrorLabel(code: string | null): string | null {
  if (code === null) return null;
  const messages: Readonly<Record<string, string>> = zhCN.modelConnections.errors.byCode;
  return messages[code] ?? code;
}

function readErrorCode(details: unknown): string {
  if (
    typeof details === "object" &&
    details !== null &&
    "error" in details &&
    typeof details.error === "object" &&
    details.error !== null &&
    "code" in details.error &&
    typeof details.error.code === "string"
  ) {
    return details.error.code;
  }
  return "REQUEST_FAILED";
}
