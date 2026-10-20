import { Download, File, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AnalysisOutput } from "@/features/analysis/api";
import { OutputCard } from "@/features/analysis/OutputCard";
import { CopyButton } from "@/features/messages/rendering/CopyButton";
import {
  readWorkspaceFile,
  type WorkspaceEntry,
} from "@/features/workspaces/files/files-api";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.workspaceBrowser;
const textLimit = 2 * 1024 * 1024;
const mediaLimit = 16 * 1024 * 1024;
const textExtensions = new Set([
  "txt",
  "md",
  "csv",
  "tsv",
  "json",
  "geojson",
  "jsonl",
  "ndjson",
  "xml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "log",
  "py",
  "js",
  "ts",
  "tsx",
  "jsx",
  "css",
  "html",
  "sql",
  "sh",
  "r",
]);

type PreviewKind = "text" | "image" | "pdf" | "unsupported";

function previewKind(entry: WorkspaceEntry): PreviewKind {
  const type = entry.media_type ?? "";
  const extension = entry.name.split(".").pop()?.toLowerCase() ?? "";
  if (type.startsWith("image/") && !["tif", "tiff"].includes(extension))
    return "image";
  if (type === "application/pdf") return "pdf";
  if (
    type.startsWith("text/") ||
    type.endsWith("+json") ||
    type === "application/json" ||
    textExtensions.has(extension)
  )
    return "text";
  return "unsupported";
}

export function WorkspaceFilePreview({
  entry,
  workspaceId,
  output,
  sessionId,
}: {
  readonly entry: WorkspaceEntry;
  readonly workspaceId: string;
  readonly output: AnalysisOutput | undefined;
  readonly sessionId: string | null;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const blob = await readWorkspaceFile(workspaceId, entry.file_path);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = entry.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      console.error("[workspaces] File download failed.", {
        path: entry.file_path,
        reason,
      });
      setError(content.downloadFailed);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      aria-label={content.preview}
    >
      <header className="flex min-w-0 items-center gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium" title={entry.name}>
            {entry.name}
          </h3>
          <p
            className="mt-1 truncate text-xs text-muted-foreground"
            title={entry.file_path}
          >
            {entry.file_path}
          </p>
        </div>
        <CopyButton text={entry.file_path} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={downloading}
          aria-label={content.download}
          title={content.download}
          onClick={() => void download()}
        >
          {downloading ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
        </Button>
      </header>
      {error !== null && (
        <p role="alert" className="px-4 pt-3 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {output !== undefined ? (
          <OutputCard
            output={output}
            workspaceId={workspaceId}
            sessionId={sessionId}
            compact
          />
        ) : (
          <FileContent entry={entry} workspaceId={workspaceId} />
        )}
      </div>
    </section>
  );
}

function FileContent({
  entry,
  workspaceId,
}: {
  readonly entry: WorkspaceEntry;
  readonly workspaceId: string;
}) {
  const kind = previewKind(entry);
  const limit = kind === "text" ? textLimit : mediaLimit;
  const tooLarge = (entry.bytes ?? 0) > limit;
  const [preview, setPreview] = useState<{
    url: string;
    text: string | null;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (kind === "unsupported" || tooLarge) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setPreview(null);
    setFailed(false);
    void readWorkspaceFile(
      workspaceId,
      entry.file_path,
      controller.signal,
      limit,
    )
      .then(async (blob) => {
        const text =
          kind === "text"
            ? new TextDecoder("utf-8", { fatal: true }).decode(
                await blob.arrayBuffer(),
              )
            : null;
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ url: objectUrl, text });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        console.error("[workspaces] File preview failed.", {
          path: entry.file_path,
          reason,
        });
        setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [workspaceId, entry.file_path, entry.modified_at, kind, limit, tooLarge]);

  if (kind === "unsupported" || tooLarge)
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <File className="size-8" strokeWidth={1.5} />
        <p>{tooLarge ? content.tooLarge : content.unsupported}</p>
      </div>
    );
  if (failed)
    return (
      <p role="alert" className="text-sm text-destructive">
        {content.previewFailed}
      </p>
    );
  if (preview === null)
    return (
      <p
        role="status"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <LoaderCircle className="size-4 animate-spin" />
        {content.loadingPreview}
      </p>
    );
  if (kind === "text")
    return (
      <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs leading-6">
        {preview.text}
      </pre>
    );
  if (kind === "pdf")
    return (
      <iframe
        src={preview.url}
        title={entry.name}
        className="h-full min-h-80 w-full rounded-md border-0"
      />
    );
  return (
    <img
      src={preview.url}
      alt={entry.name}
      className="h-full max-h-[400px] w-full rounded-md bg-muted object-contain"
      onError={() => {
        console.error("[workspaces] Image decoding failed.", {
          path: entry.file_path,
        });
        setFailed(true);
      }}
    />
  );
}
