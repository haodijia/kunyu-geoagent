import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { BackendProcessManager } from "./backend-process-manager";
import {
  RUNTIME_CONNECTION_CHANNEL,
  type RuntimeConnection
} from "../shared/runtime";

const FRONTEND_DEVELOPMENT_URL = "http://127.0.0.1:5173";
let mainWindow: BrowserWindow | null = null;
let runtimeConnection: RuntimeConnection | null = null;
let allowQuit = false;
let shutdownStarted = false;
const backendProcessManager = new BackendProcessManager();

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
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
    .then(async () => {
      const connection = await backendProcessManager.start();
      console.info(`Backend is ready at ${connection.baseUrl}.`);
      runtimeConnection = Object.freeze(connection);
      await createMainWindow();
    })
    .catch((error: unknown) => {
      console.error("Desktop startup failed.", error);
      app.quit();
    });

  app.on("window-all-closed", () => {
    app.quit();
  });
}

async function createMainWindow(): Promise<void> {
  if (mainWindow !== null) {
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: true
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("preload-error", (_event, _preloadPath, error) => {
    console.error("Preload failed.", error);
  });

  const frontendEntry = app.isPackaged
    ? path.join(process.resourcesPath, "frontend", "index.html")
    : FRONTEND_DEVELOPMENT_URL;

  protectNavigation(mainWindow, frontendEntry);

  if (app.isPackaged) {
    await mainWindow.loadFile(frontendEntry);
    return;
  }

  await mainWindow.loadURL(frontendEntry);
}

function protectNavigation(window: BrowserWindow, frontendEntry: string): void {
  const allowedEntry = app.isPackaged
    ? pathToFileURL(frontendEntry).toString()
    : frontendEntry;

  window.webContents.on("will-navigate", (event, navigationUrl) => {
    if (isAllowedNavigation(navigationUrl, allowedEntry)) {
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
