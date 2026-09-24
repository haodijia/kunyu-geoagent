import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  BackendStartupError,
  type BackendFailureDetails
} from "./backend-diagnostics";
import { BackendProcessManager } from "./backend-process-manager";
import { BACKEND_DIAGNOSTICS_PAGE_URL } from "./backend-diagnostics-page";
import {
  RUNTIME_CONNECTION_CHANNEL,
  type RuntimeConnection
} from "../shared/runtime";

const FRONTEND_DEVELOPMENT_URL = "http://127.0.0.1:5173";
const FAILURE_CHANNEL = "diagnostics:get-backend-failure";
const RETRY_CHANNEL = "diagnostics:retry-backend";
let mainWindow: BrowserWindow | null = null;
let runtimeConnection: RuntimeConnection | null = null;
let backendFailure: BackendFailureDetails | null = null;
let allowQuit = false;
let retryInProgress = false;
let shutdownStarted = false;
const backendProcessManager = new BackendProcessManager();

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  process.once("SIGINT", () => app.quit());
  process.once("SIGTERM", () => app.quit());

  ipcMain.on(RUNTIME_CONNECTION_CHANNEL, (event) => {
    if (
      mainWindow === null ||
      event.sender !== mainWindow.webContents ||
      runtimeConnection === null
    ) {
      event.returnValue = null;
      return;
    }

    event.returnValue = runtimeConnection;
  });

  ipcMain.on(FAILURE_CHANNEL, (event) => {
    if (
      mainWindow === null ||
      event.sender !== mainWindow.webContents ||
      backendFailure === null
    ) {
      event.returnValue = null;
      return;
    }

    event.returnValue = backendFailure;
  });

  ipcMain.handle(RETRY_CHANNEL, async (event) => {
    if (
      mainWindow === null ||
      event.sender !== mainWindow.webContents ||
      backendFailure === null
    ) {
      throw new Error("Backend retry is unavailable.");
    }

    if (retryInProgress) {
      return { ok: false, busy: true, failure: backendFailure };
    }

    retryInProgress = true;
    try {
      const connection = await backendProcessManager.restart();
      await activateBackendConnection(connection);
      return { ok: true };
    } catch (error: unknown) {
      backendFailure = toBackendFailure(error);
      console.error("Backend retry failed.", error);
      return { ok: false, busy: false, failure: backendFailure };
    } finally {
      retryInProgress = false;
    }
  });

  app.on("before-quit", (event) => {
    if (allowQuit) {
      return;
    }

    event.preventDefault();
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    runtimeConnection = null;
    void backendProcessManager
      .stop()
      .catch((error: unknown) => {
        console.error("Backend shutdown failed.", error);
      })
      .finally(() => {
        allowQuit = true;
        app.quit();
      });
  });

  app.on("second-instance", () => {
    if (mainWindow === null) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady()
    .then(startDesktop)
    .catch((error: unknown) => {
      console.error("Desktop startup failed.", error);
      app.quit();
    });

  app.on("window-all-closed", () => {
    app.quit();
  });
}

async function startDesktop(): Promise<void> {
  let connection: RuntimeConnection;
  try {
    connection = await backendProcessManager.start();
  } catch (error: unknown) {
    backendFailure = toBackendFailure(error);
    console.error("Backend startup failed.", error);
    await showBackendDiagnostics();
    return;
  }

  await activateBackendConnection(connection);
}

async function activateBackendConnection(connection: RuntimeConnection): Promise<void> {
  console.info(`Backend is ready at ${connection.baseUrl}.`);
  runtimeConnection = Object.freeze(connection);
  backendFailure = null;
  await showFrontend();
}

async function showFrontend(): Promise<void> {
  const previousWindow = mainWindow;
  const window = createWindow("index.js");
  mainWindow = window;

  const frontendEntry = app.isPackaged
    ? path.join(process.resourcesPath, "frontend", "index.html")
    : FRONTEND_DEVELOPMENT_URL;
  const frontendNavigationEntry = app.isPackaged
    ? pathToFileURL(frontendEntry).toString()
    : frontendEntry;
  protectNavigation(window, frontendNavigationEntry);

  try {
    if (app.isPackaged) {
      await window.loadFile(frontendEntry);
    } else {
      await window.loadURL(frontendEntry);
    }
  } catch (error: unknown) {
    mainWindow = previousWindow;
    window.destroy();
    throw error;
  }

  window.show();
  if (previousWindow !== null && !previousWindow.isDestroyed()) {
    previousWindow.destroy();
  }
}

async function showBackendDiagnostics(): Promise<void> {
  const previousWindow = mainWindow;
  const window = createWindow("backend-diagnostics.js");
  mainWindow = window;
  protectNavigation(window, BACKEND_DIAGNOSTICS_PAGE_URL);
  await window.loadURL(BACKEND_DIAGNOSTICS_PAGE_URL);
  window.show();

  if (previousWindow !== null && !previousWindow.isDestroyed()) {
    previousWindow.destroy();
  }
}

function createWindow(preloadFile: string): BrowserWindow {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, `../preload/${preloadFile}`),
      sandbox: true
    }
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.webContents.on("preload-error", (_event, _preloadPath, error) => {
    console.error("Preload failed.", error);
  });
  return window;
}

function toBackendFailure(error: unknown): BackendFailureDetails {
  if (error instanceof BackendStartupError) {
    return error.details;
  }

  return {
    type: "unknown_error",
    message: error instanceof Error ? error.message : "Unknown backend startup error.",
    exitCode: null,
    logs: []
  };
}

function protectNavigation(window: BrowserWindow, frontendEntry: string): void {
  window.webContents.on("will-navigate", (event, navigationUrl) => {
    if (isAllowedNavigation(navigationUrl, frontendEntry)) {
      return;
    }

    event.preventDefault();
    openExternalUrl(navigationUrl);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });
}

function isAllowedNavigation(navigationUrl: string, frontendEntry: string): boolean {
  try {
    const target = new URL(navigationUrl);
    const entry = new URL(frontendEntry);

    if (entry.protocol === "file:") {
      return target.protocol === "file:" && target.pathname === entry.pathname;
    }

    return target.origin === entry.origin;
  } catch {
    return false;
  }
}

function openExternalUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    console.error("Blocked an invalid external URL.");
    return;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    console.error(`Blocked external URL protocol: ${url.protocol}`);
    return;
  }

  void shell.openExternal(url.toString()).catch(() => {
    console.error("Failed to open an external URL.");
  });
}
