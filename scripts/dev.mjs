import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FORCE_EXIT_TIMEOUT_MS = 25_000;
const VITE_READY_TIMEOUT_MS = 15_000;
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const frontendDirectory = path.join(repositoryRoot, "frontend");
const viteBinary = path.join(
  frontendDirectory,
  "node_modules/vite/bin/vite.js",
);

const activeProcesses = new Set();
let resolveShutdown;
let stopping = false;
const shutdownComplete = new Promise((resolve) => {
  resolveShutdown = resolve;
});

process.once("SIGINT", () => {
  void shutdown(130);
});
process.once("SIGTERM", () => {
  void shutdown(143);
});

await main();

async function main() {
  try {
    const npmCli = process.env.npm_execpath;
    if (!npmCli || !path.isAbsolute(npmCli)) {
      throw new Error('Start development with "npm run dev".');
    }
    process.loadEnvFile(path.join(repositoryRoot, ".env"));
    if (process.env.KUNYU_PUBLIC_URL !== "http://localhost:5173/") {
      throw new Error(
        "Set KUNYU_PUBLIC_URL=http://localhost:5173/ for development.",
      );
    }
    const build = startProcess(
      "build",
      process.execPath,
      [npmCli, "run", "build"],
      frontendDirectory,
    );
    const buildResult = await build.exited;
    if (stopping) return await shutdownComplete;
    if (buildResult.code !== 0) throw new Error("Frontend build failed.");
    process.env.KUNYU_FRONTEND_DIST = path.join(frontendDirectory, "dist");
    process.env.PORT = "3000";
    const backend = startProcess(
      "backend",
      "uv",
      ["run", "--project", "backend", "python", "-m", "kunyu.main"],
      repositoryRoot,
    );
    const vite = startProcess(
      "vite",
      process.execPath,
      [viteBinary, "--host", "localhost"],
      frontendDirectory,
    );
    await waitForVite(vite);
    if (stopping) return await shutdownComplete;
    for (const service of [backend, vite]) {
      void service.exited.then((result) => {
        if (!stopping) {
          console.error(
            `[dev] ${service.name} exited (${formatExit(result)}).`,
          );
          void shutdown(result.code ?? 1);
        }
      });
    }
    console.log("[dev] Open http://localhost:5173/ in your browser.");
    await shutdownComplete;
  } catch (error) {
    if (!stopping) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown development startup error.";
      console.error(`[dev] ${message}`);
      await shutdown(1);
    } else {
      await shutdownComplete;
    }
  }
}

function startProcess(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let exited = false;
  const service = {
    name,
    child,
    exited: new Promise((resolve) => {
      const finish = (code, signal) => {
        if (exited) {
          return;
        }

        exited = true;
        activeProcesses.delete(service);
        resolve({ code, signal });
      };

      child.once("exit", finish);
      child.once("error", (error) => {
        console.error(`[${name}] Failed to start: ${error.message}`);
        finish(1, null);
      });
    }),
  };

  activeProcesses.add(service);
  prefixOutput(name, child.stdout, process.stdout);
  prefixOutput(name, child.stderr, process.stderr);
  return service;
}

function prefixOutput(name, source, destination) {
  let buffer = "";
  source.setEncoding("utf8");
  source.on("data", (chunk) => {
    buffer += chunk.replaceAll("\r", "\n");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length > 0) {
        destination.write(`[${name}] ${line}\n`);
      }
    }
  });
  source.on("end", () => {
    if (buffer.length > 0) {
      destination.write(`[${name}] ${buffer}\n`);
    }
  });
}

function waitForVite(vite) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onData = (chunk) => {
      const text = stripAnsi(chunk.toString("utf8"));
      if (text.includes("Local:")) {
        finish(null);
      }
    };
    const timeout = setTimeout(() => {
      finish(
        new Error(
          `Vite did not become ready within ${VITE_READY_TIMEOUT_MS}ms.`,
        ),
      );
    }, VITE_READY_TIMEOUT_MS);

    const finish = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      vite.child.stdout.off("data", onData);
      if (error === null) {
        resolve();
      } else {
        reject(error);
      }
    };

    vite.child.stdout.on("data", onData);
    void vite.exited.then((result) => {
      finish(new Error(`Vite exited before ready (${formatExit(result)}).`));
    });
  });
}

async function shutdown(exitCode) {
  if (stopping) {
    return shutdownComplete;
  }

  stopping = true;
  process.exitCode = exitCode;
  const processes = [...activeProcesses];
  for (const service of processes) {
    service.child.kill("SIGTERM");
  }

  const forceExit = setTimeout(() => {
    for (const service of activeProcesses) {
      console.error(`[dev] Force stopping ${service.name}.`);
      service.child.kill("SIGKILL");
    }
  }, FORCE_EXIT_TIMEOUT_MS);

  await Promise.allSettled(processes.map((service) => service.exited));
  clearTimeout(forceExit);
  resolveShutdown();
  return shutdownComplete;
}

function formatExit(result) {
  if (result.signal !== null) {
    return `signal=${result.signal}`;
  }
  return `code=${String(result.code)}`;
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}
