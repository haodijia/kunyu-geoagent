import { dialog, ipcMain, type BrowserWindow } from "electron";
import { DataStorage, StorageError } from "./data-storage";
import { BackendProcessManager } from "./backend-process-manager";
import type { RuntimeConnection } from "../shared/runtime";
import { STORAGE_CHANNEL, type StorageResult } from "../shared/storage";

export class DataStorageController {
  busy = false;
  constructor(
    private readonly data: DataStorage,
    private readonly backend: BackendProcessManager,
    private readonly window: () => BrowserWindow | null,
    private readonly connection: () => RuntimeConnection | null,
    private readonly setConnection: (value: RuntimeConnection | null) => void,
  ) {}

  register(): void {
    ipcMain.handle(STORAGE_CHANNEL, async (event, request: unknown): Promise<StorageResult<unknown>> => {
      const window = this.window();
      if (window === null || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error("Untrusted storage request.");
      try {
        if (typeof request !== "object" || request === null || !("action" in request)) throw new StorageError("INVALID_REQUEST");
        if (this.busy) throw new StorageError("MIGRATION_BUSY");
        if (request.action === "status") return { ok: true, value: this.data.status() };
        if (request.action === "choose") {
          const selection = await dialog.showOpenDialog(window, { properties: ["openDirectory", "createDirectory"], defaultPath: this.data.status().dataDirectory });
          if (selection.canceled) return { ok: true, value: null };
          const selected = selection.filePaths[0];
          if (selected === undefined) throw new StorageError("SELECT_DIRECTORY_FIRST");
          return { ok: true, value: await this.data.choose(selected) };
        }
        if (request.action !== "migrate") throw new StorageError("INVALID_REQUEST");
        this.busy = true;
        window.setEnabled(false);
        try { await this.migrate(); return { ok: true, value: this.data.status() }; }
        finally { this.busy = false; if (!window.isDestroyed()) window.setEnabled(true); }
      } catch (error) {
        console.error("Business data directory operation failed.", error);
        return { ok: false, code: error instanceof StorageError ? error.code : (error as NodeJS.ErrnoException).code ?? "MIGRATION_FAILED" };
      }
    });
  }

  private async migrate(): Promise<void> {
    const target = await this.data.target();
    const connection = this.connection();
    if (connection === null) throw new StorageError("BACKEND_UNAVAILABLE");
    const response = await fetch(`${connection.baseUrl}/api/v1/storage/migration-check`, { headers: { "X-Kunyu-Session": connection.sessionToken }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new StorageError(response.status === 409 ? "ACTIVE_TASKS" : "BACKEND_UNAVAILABLE");
    const source = this.data.status().dataDirectory;
    await this.backend.stop();
    this.setConnection(null);
    try {
      await this.data.copyTo(target);
      const updated = await this.backend.restart(target);
      await this.data.commit(target);
      this.setConnection(updated);
    } catch (error) {
      console.error("Data migration failed; restoring the original configured directory.", error);
      try { this.setConnection(await this.backend.restart(source)); }
      catch (restoreError) { console.error("Could not restart the original business directory.", restoreError); throw new StorageError("RESTORE_FAILED"); }
      throw error;
    }
  }
}
