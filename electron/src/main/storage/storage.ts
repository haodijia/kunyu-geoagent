import { constants } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { StorageInfo } from "../../shared/storage";

export class StorageError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

// Only persistent backend data is copied. Chromium profiles and developer recordings stay out.
const DATA_ENTRIES = ["kunyu.db", "workspaces", "skills"] as const;

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

export class DataStorage {
  private directory: string | null = null;
  private selected: string | null = null;
  private runtimeRoot: string;
  private readonly preferences: string;

  constructor(
    readonly runtimeDirectory: string,
    private readonly defaultDirectory: string,
  ) {
    this.runtimeRoot = runtimeDirectory;
    this.preferences = path.join(runtimeDirectory, "business-data.json");
  }

  async initialize(): Promise<string> {
    await mkdir(this.runtimeDirectory, { recursive: true, mode: 0o700 });
    this.runtimeRoot = await realpath(this.runtimeDirectory);
    let configured = false;
    try {
      await access(this.preferences);
      configured = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (configured) {
      const value: unknown = JSON.parse(
        await readFile(this.preferences, "utf8"),
      );
      if (
        typeof value !== "object" ||
        value === null ||
        !("dataDirectory" in value) ||
        typeof value.dataDirectory !== "string" ||
        !path.isAbsolute(value.dataDirectory)
      )
        throw new StorageError("INVALID_CONFIGURATION");
      const directory = await realpath(value.dataDirectory);
      if (!(await stat(directory)).isDirectory())
        throw new StorageError("DIRECTORY_UNAVAILABLE");
      await access(
        path.join(directory, "kunyu.db"),
        constants.R_OK | constants.W_OK,
      );
      this.directory = directory;
    } else {
      // Existing development data must be explicitly upgraded, never replaced with an empty DB.
      try {
        await access(path.join(this.runtimeDirectory, "kunyu.db"));
        throw new StorageError("LEGACY_DATA_REQUIRES_MIGRATION");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await mkdir(this.defaultDirectory, { recursive: true, mode: 0o700 });
      this.directory = await realpath(this.defaultDirectory);
      await this.save(this.directory);
    }
    if (
      contains(this.runtimeRoot, this.directory) ||
      contains(this.directory, this.runtimeRoot)
    )
      throw new StorageError("RUNTIME_DIRECTORY_OVERLAP");
    return this.directory;
  }

  status(): StorageInfo {
    if (this.directory === null)
      throw new StorageError("DIRECTORY_UNAVAILABLE");
    return {
      dataDirectory: this.directory,
      runtimeDirectory: this.runtimeDirectory,
    };
  }

  async choose(directory: string): Promise<string> {
    this.selected = await this.validateTarget(directory);
    return this.selected;
  }

  async target(): Promise<string> {
    if (this.selected === null)
      throw new StorageError("SELECT_DIRECTORY_FIRST");
    return this.validateTarget(this.selected);
  }

  async copyTo(target: string): Promise<void> {
    await this.validateTarget(target);
    const source = this.status().dataDirectory;
    // Closing the backend must leave a checkpointed DB before it can be copied.
    try {
      if ((await stat(path.join(source, "kunyu.db-wal"))).size > 0)
        throw new StorageError("DATABASE_BUSY");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await chmod(target, 0o700);
    for (const entry of DATA_ENTRIES) {
      const sourcePath = path.join(source, entry);
      try {
        await lstat(sourcePath);
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code === "ENOENT" &&
          entry !== "kunyu.db"
        )
          continue;
        throw error;
      }
      await copyVerified(sourcePath, path.join(target, entry));
    }
  }

  async commit(target: string): Promise<void> {
    await this.save(target);
    this.directory = target;
    this.selected = null;
  }

  private async validateTarget(directory: string): Promise<string> {
    const target = await realpath(directory);
    const source = this.status().dataDirectory;
    if (!(await stat(target)).isDirectory())
      throw new StorageError("DIRECTORY_UNAVAILABLE");
    if (contains(source, target) || contains(target, source))
      throw new StorageError("DATA_DIRECTORY_OVERLAP");
    if (
      contains(this.runtimeRoot, target) ||
      contains(target, this.runtimeRoot)
    )
      throw new StorageError("RUNTIME_DIRECTORY_OVERLAP");
    if ((await readdir(target)).length !== 0)
      throw new StorageError("DIRECTORY_NOT_EMPTY");
    await access(target, constants.R_OK | constants.W_OK);
    return target;
  }

  private async save(directory: string): Promise<void> {
    const temporary = `${this.preferences}.tmp`;
    try {
      await writeFile(
        temporary,
        JSON.stringify({ dataDirectory: directory }, null, 2),
        { mode: 0o600 },
      );
      const file = await open(temporary, "r+");
      try {
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, this.preferences);
    } catch (error) {
      await unlink(temporary).catch((cleanupError: NodeJS.ErrnoException) => {
        if (cleanupError.code !== "ENOENT")
          console.error(
            "Could not remove unpublished storage configuration.",
            cleanupError,
          );
      });
      throw error;
    }
  }
}

async function copyVerified(source: string, target: string): Promise<void> {
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new StorageError("SYMLINK_UNSUPPORTED");
  if (info.isDirectory()) {
    await mkdir(target, { recursive: true, mode: 0o700 });
    for (const name of await readdir(source))
      await copyVerified(path.join(source, name), path.join(target, name));
    return;
  }
  if (!info.isFile()) throw new StorageError("UNSUPPORTED_FILE");
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await copyFile(source, target, constants.COPYFILE_EXCL);
  await chmod(target, 0o600 | (info.mode & 0o100));
  const original = await open(source, "r");
  try {
    const copied = await open(target, "r+");
    try {
      const left = Buffer.alloc(1024 * 1024);
      const right = Buffer.alloc(left.length);
      let position = 0;
      while (position < info.size) {
        const length = Math.min(left.length, info.size - position);
        const [a, b] = await Promise.all([
          original.read(left, 0, length, position),
          copied.read(right, 0, length, position),
        ]);
        if (
          a.bytesRead !== length ||
          b.bytesRead !== length ||
          !left.subarray(0, length).equals(right.subarray(0, length))
        )
          throw new StorageError("COPY_VERIFICATION_FAILED");
        position += length;
      }
      if (
        (await copied.stat()).size !== info.size ||
        (await original.stat()).size !== info.size
      )
        throw new StorageError("COPY_VERIFICATION_FAILED");
      await copied.sync();
    } finally {
      await copied.close();
    }
  } finally {
    await original.close();
  }
}
