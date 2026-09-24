import { app, BrowserWindow } from "electron";
import path from "node:path";

import { BackendProcessManager } from "./backend-process-manager";

let mainWindow: BrowserWindow | null = null;
const backendProcessManager = new BackendProcessManager();

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
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
      createMainWindow();
    })
    .catch((error: unknown) => {
      console.error("Desktop startup failed.", error);
      app.quit();
    });

  app.on("window-all-closed", () => {
    app.quit();
  });
}

function createMainWindow(): void {
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

  void mainWindow.loadURL("about:blank");
}
