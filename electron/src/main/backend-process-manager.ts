import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

import type { RuntimeConnection } from "../shared/runtime";
import {
  BackendLogCollector,
  BackendStartupError,
  type BackendStartupErrorType
} from "./backend-diagnostics";

const API_VERSION = "1";
const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = 8000;
const FORCE_KILL_WAIT_MS = 1_000;
const HEALTH_TIMEOUT_MS = 5_000;
const MAX_READY_LINE_LENGTH = 16_384;
const SESSION_HEADER = "X-Kunyu-Session";
const SESSION_TOKEN_ENV = "KUNYU_SESSION_TOKEN";
const SHUTDOWN_REQUEST_TIMEOUT_MS = 2_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const STARTUP_TIMEOUT_MS = 15_000;

type BackendProcessState =
  | "idle"
  | "starting"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed";

interface ReadyMessage {
  type: "ready";
  host: string;
  port: number;
  pid: number;
  api_version: "1";
}

interface HealthResponse {
  status: "healthy";
  api_version: "1";
}

export class BackendProcessManager {
  private backendPid: number | null = null;
  private child: ChildProcess | null = null;
  private connection: RuntimeConnection | null = null;
  private readonly logs = new BackendLogCollector();
  private state: BackendProcessState = "idle";
  private stopPromise: Promise<void> | null = null;

  async start(): Promise<RuntimeConnection> {
    if (this.state !== "idle") {
      throw new Error(`Cannot start backend from ${this.state} state.`);
    }

    this.state = "starting";
    this.logs.reset();
    const sessionToken = randomBytes(32).toString("base64url");
    const repositoryRoot = path.resolve(__dirname, "../../..");
    const child = spawn(
      "uv",
      ["run", "--project", "backend", "python", "-m", "kunyu.main", "--desktop"],
      {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          [SESSION_TOKEN_ENV]: sessionToken
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      }
    );
    this.child = child;

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      for (const line of this.logs.capture(chunk, sessionToken)) {
        process.stderr.write(`[backend] ${line}\n`);
      }
    });
    child.stderr?.on("end", () => {
      const line = this.logs.flush(sessionToken);
      if (line !== null) {
        process.stderr.write(`[backend] ${line}\n`);
      }
    });

    try {
      const readyMessage = await this.waitForReady(child);
      this.backendPid = readyMessage.pid;
      const baseUrl = `http://${readyMessage.host}:${readyMessage.port}`;
      await this.checkHealth(baseUrl, sessionToken);

      if (child.exitCode !== null || child.signalCode !== null) {
        throw this.createStartupError(
          "process_exit",
          "Backend exited during its health check.",
          child.exitCode
        );
      }

      const connection: RuntimeConnection = {
        baseUrl,
        apiVersion: readyMessage.api_version,
        sessionToken
      };
      this.connection = connection;
      this.state = "ready";
      child.once("exit", (code, signal) => {
        if (this.child !== child || this.state !== "ready") {
          return;
        }

        this.backendPid = null;
        this.child = null;
        this.connection = null;
        this.state = "failed";
        console.error(
          `Backend exited unexpectedly (code=${String(code)}, signal=${String(signal)}).`
        );
      });
      child.once("error", (error) => {
        if (this.child === child && this.state === "ready") {
          this.state = "failed";
          console.error("Backend process error.", error);
        }
      });

      return connection;
    } catch (error: unknown) {
      this.state = "failed";
      await this.terminateChild(child);
      this.backendPid = null;
      this.child = null;
      this.connection = null;
      throw this.decorateStartupError(error, child.exitCode);
    }
  }

  async restart(): Promise<RuntimeConnection> {
    await this.stop();
    this.state = "idle";
    this.stopPromise = null;
    return this.start();
  }

  stop(): Promise<void> {
    if (this.stopPromise === null) {
      this.stopPromise = this.stopInternal();
    }

    return this.stopPromise;
  }

  private async stopInternal(): Promise<void> {
    const child = this.child;
    const connection = this.connection;
    this.state = "stopping";

    if (child === null) {
      this.finishStop();
      return;
    }

    if (child.exitCode !== null || child.signalCode !== null) {
      await this.terminateChild(child);
      this.finishStop();
      return;
    }

    if (connection !== null) {
      try {
        await this.requestGracefulShutdown(connection);
      } catch (error: unknown) {
        console.error("Backend graceful shutdown request failed.", this.asError(error));
      }

      if (await this.waitForExit(child, SHUTDOWN_TIMEOUT_MS)) {
        this.finishStop();
        return;
      }
    }

    await this.terminateChild(child);
    this.finishStop();
  }

  private finishStop(): void {
    this.backendPid = null;
    this.child = null;
    this.connection = null;
    this.state = "stopped";
  }

  private async terminateChild(child: ChildProcess): Promise<void> {
    if (this.backendPid !== null && this.isProcessRunning(this.backendPid)) {
      process.kill(this.backendPid, "SIGKILL");
    }

    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await this.waitForExit(child, FORCE_KILL_WAIT_MS);
    }
  }

  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private createStartupError(
    type: BackendStartupErrorType,
    message: string,
    exitCode: number | null = null
  ): BackendStartupError {
    return new BackendStartupError({
      type,
      message,
      exitCode,
      logs: this.logs.snapshot()
    });
  }

  private decorateStartupError(
    error: unknown,
    exitCode: number | null
  ): BackendStartupError {
    if (error instanceof BackendStartupError) {
      return this.createStartupError(
        error.details.type,
        error.details.message,
        error.details.exitCode ?? exitCode
      );
    }

    const message = error instanceof Error ? error.message : "Unknown backend startup error.";
    return this.createStartupError("unknown_error", message, exitCode);
  }

  private async requestGracefulShutdown(connection: RuntimeConnection): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      SHUTDOWN_REQUEST_TIMEOUT_MS
    );

    try {
      const response = await fetch(`${connection.baseUrl}/api/v1/system/shutdown`, {
        method: "POST",
        headers: {
          [SESSION_HEADER]: connection.sessionToken
        },
        signal: controller.signal
      });

      if (response.status !== 202) {
        throw new Error(`Backend shutdown returned HTTP ${response.status}.`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const onExit = (): void => {
        clearTimeout(timeout);
        resolve(true);
      };
      const timeout = setTimeout(() => {
        child.off("exit", onExit);
        resolve(false);
      }, timeoutMs);

      child.once("exit", onExit);
    });
  }

  private waitForReady(child: ChildProcess): Promise<ReadyMessage> {
    const stdout = child.stdout;
    if (stdout === null) {
      return Promise.reject(
        this.createStartupError("protocol_error", "Backend stdout is unavailable.")
      );
    }

    return new Promise((resolve, reject) => {
      let buffer = "";
      let settled = false;

      const finish = (error: Error | null, readyMessage?: ReadyMessage): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        stdout.off("data", onData);
        child.off("error", onError);
        child.off("close", onClose);

        if (error !== null) {
          reject(error);
          return;
        }

        resolve(readyMessage as ReadyMessage);
      };

      const onData = (chunk: Buffer): void => {
        buffer += chunk.toString("utf8");
        if (buffer.length > MAX_READY_LINE_LENGTH) {
          finish(
            this.createStartupError(
              "protocol_error",
              "Backend ready message exceeds the protocol limit."
            )
          );
          return;
        }

        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          return;
        }

        const line = buffer.slice(0, newlineIndex).trim();
        try {
          finish(null, this.parseReadyMessage(line));
        } catch (error: unknown) {
          finish(this.asError(error));
        }
      };

      const onError = (error: Error): void => {
        finish(
          this.createStartupError(
            "spawn_error",
            `Failed to start backend: ${error.message}`
          )
        );
      };

      const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
        finish(
          this.createStartupError(
            "process_exit",
            `Backend exited before ready (code=${String(code)}, signal=${String(signal)}).`,
            code
          )
        );
      };

      const timeout = setTimeout(() => {
        finish(
          this.createStartupError(
            "startup_timeout",
            `Backend did not become ready within ${STARTUP_TIMEOUT_MS}ms.`
          )
        );
      }, STARTUP_TIMEOUT_MS);

      stdout.setEncoding("utf8");
      stdout.on("data", onData);
      child.once("error", onError);
      child.once("close", onClose);
    });
  }

  private parseReadyMessage(line: string): ReadyMessage {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw this.createStartupError(
        "protocol_error",
        "Backend emitted invalid ready JSON."
      );
    }

    if (
      typeof value !== "object" ||
      value === null ||
      !("type" in value) ||
      value.type !== "ready" ||
      !("host" in value) ||
      value.host !== BACKEND_HOST ||
      !("port" in value) ||
      value.port !== BACKEND_PORT ||
      !("pid" in value) ||
      typeof value.pid !== "number" ||
      !Number.isInteger(value.pid) ||
      value.pid <= 0 ||
      !("api_version" in value) ||
      value.api_version !== API_VERSION
    ) {
      throw this.createStartupError(
        "protocol_error",
        "Backend ready message does not match the desktop protocol."
      );
    }

    return value as ReadyMessage;
  }

  private async checkHealth(baseUrl: string, sessionToken: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/api/v1/system/health`, {
        headers: {
          [SESSION_HEADER]: sessionToken
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw this.createStartupError(
          "health_error",
          `Backend health check returned HTTP ${response.status}.`
        );
      }

      const value: unknown = await response.json();
      if (!this.isHealthResponse(value)) {
        throw this.createStartupError(
          "health_error",
          "Backend health response does not match the desktop protocol."
        );
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        throw this.createStartupError(
          "health_error",
          `Backend health check timed out after ${HEALTH_TIMEOUT_MS}ms.`
        );
      }
      if (error instanceof BackendStartupError) {
        throw error;
      }
      throw this.createStartupError(
        "health_error",
        `Backend health check failed: ${this.asError(error).message}`
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private isHealthResponse(value: unknown): value is HealthResponse {
    return (
      typeof value === "object" &&
      value !== null &&
      "status" in value &&
      value.status === "healthy" &&
      "api_version" in value &&
      value.api_version === API_VERSION
    );
  }

  private asError(error: unknown): Error {
    return error instanceof Error ? error : new Error("Unknown backend startup error.");
  }
}
