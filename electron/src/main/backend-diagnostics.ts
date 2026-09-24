const MAX_LOG_CHARS = 8_000;
const MAX_LOG_LINES = 50;

export type BackendStartupErrorType =
  | "spawn_error"
  | "startup_timeout"
  | "protocol_error"
  | "health_error"
  | "process_exit"
  | "unknown_error";

export interface BackendFailureDetails {
  readonly type: BackendStartupErrorType;
  readonly message: string;
  readonly exitCode: number | null;
  readonly logs: readonly string[];
}

export class BackendStartupError extends Error {
  constructor(readonly details: BackendFailureDetails) {
    super(details.message);
    this.name = "BackendStartupError";
  }
}

export class BackendLogCollector {
  private buffer = "";
  private lines: string[] = [];

  reset(): void {
    this.buffer = "";
    this.lines = [];
  }

  capture(chunk: string, sessionToken: string): readonly string[] {
    this.buffer += chunk.replaceAll("\r", "\n");
    const completeLines = this.buffer.split("\n");
    this.buffer = completeLines.pop() ?? "";
    return completeLines
      .filter((line) => line.length > 0)
      .map((line) => this.store(line, sessionToken));
  }

  flush(sessionToken: string): string | null {
    if (this.buffer.length === 0) {
      return null;
    }

    const line = this.store(this.buffer, sessionToken);
    this.buffer = "";
    return line;
  }

  snapshot(): readonly string[] {
    const limited: string[] = [];
    let remaining = MAX_LOG_CHARS;
    for (const line of this.lines.slice(-MAX_LOG_LINES).reverse()) {
      if (remaining <= 0) {
        break;
      }
      limited.push(line.slice(-remaining));
      remaining -= line.length;
    }
    return limited.reverse();
  }

  private store(value: string, sessionToken: string): string {
    const line = this.sanitize(value, sessionToken);
    this.lines.push(line);
    if (this.lines.length > MAX_LOG_LINES) {
      this.lines = this.lines.slice(-MAX_LOG_LINES);
    }
    return line;
  }

  private sanitize(value: string, sessionToken: string): string {
    const withoutSession = value.replaceAll(sessionToken, "[REDACTED]");
    return withoutSession.replace(
      /\b(token|secret|password|api[_-]?key)\b\s*[:=]\s*[^\s,;]+/gi,
      "$1=[REDACTED]"
    );
  }
}
