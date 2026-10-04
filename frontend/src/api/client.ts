import { getRuntimeConnection } from "./runtime";
import { zhCN } from "@/locales/zh-CN";

const SESSION_HEADER = "X-Kunyu-Session";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;

  constructor(status: number, message: string, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = extractErrorCode(details);
    this.details = details;
  }
}

export interface ServerSentEvent {
  readonly id: string | null;
  readonly event: string | null;
  readonly data: string;
}

export async function requestBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const response = await request(path, { method: "GET", signal }, "application/octet-stream");
  return response.blob();
}

export async function requestJson<ResponseBody>(
  path: string,
  init: RequestInit = {}
): Promise<ResponseBody> {
  const response = await request(path, init, "application/json");
  if (response.status === 204) {
    return undefined as ResponseBody;
  }
  return (await response.json()) as ResponseBody;
}

export async function* streamEvents(
  path: string,
  signal?: AbortSignal,
  onOpen?: () => void
): AsyncGenerator<ServerSentEvent> {
  const response = await request(
    path,
    { method: "GET", signal },
    "text/event-stream"
  );
  if (response.body === null) {
    throw new ApiError(
      response.status,
      zhCN.api.eventStreamMissingBody,
      null
    );
  }

  const reader = response.body.getReader();
  onOpen?.();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseEvent(block);
        if (event !== null) {
          yield event;
        }
        boundary = buffer.indexOf("\n\n");
      }

      if (done) {
        break;
      }
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

async function request(
  path: string,
  init: RequestInit,
  accept: string
): Promise<Response> {
  if (!path.startsWith("/api/")) {
    throw new Error(zhCN.api.invalidPath(path));
  }

  const connection = getRuntimeConnection();
  const headers = new Headers(init.headers);
  headers.set("Accept", accept);
  headers.set(SESSION_HEADER, connection.sessionToken);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(new URL(path, connection.baseUrl), {
    ...init,
    headers
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response;
}

async function throwApiError(response: Response): Promise<never> {
  const contentType = response.headers.get("Content-Type") ?? "";
  const details = contentType.includes("application/json")
    ? ((await response.json()) as unknown)
    : await response.text();
  const message =
    extractErrorMessage(details) ?? zhCN.api.requestFailed(response.status);
  throw new ApiError(response.status, message, details);
}

function extractErrorMessage(details: unknown): string | null {
  if (
    typeof details === "object" &&
    details !== null &&
    "error" in details &&
    typeof details.error === "object" &&
    details.error !== null &&
    "message" in details.error &&
    typeof details.error.message === "string"
  ) {
    return details.error.message;
  }
  return null;
}

function extractErrorCode(details: unknown): string | null {
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
  return null;
}

function parseEvent(block: string): ServerSentEvent | null {
  let id: string | null = null;
  let event: string | null = null;
  const data: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith(":")) {
      continue;
    }
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const rawValue = separator < 0 ? "" : line.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "id") {
      id = value;
    } else if (field === "event") {
      event = value;
    } else if (field === "data") {
      data.push(value);
    }
  }

  if (data.length === 0) {
    return null;
  }
  return { id, event, data: data.join("\n") };
}
