import { useQuery } from "@tanstack/react-query";
import { ChevronRight, File, FolderClosed, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { AnalysisOutput } from "@/features/analysis/api";
import { WorkspaceFilePreview } from "@/features/workspaces/files/WorkspaceFilePreview";
import {
  listWorkspaceFiles,
  workspaceFileKeys,
} from "@/features/workspaces/files/files-api";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.workspaceBrowser;

export function WorkspaceFileBrowser({
  workspaceId,
  outputs,
  sessionId,
}: {
  readonly workspaceId: string;
  readonly outputs: readonly AnalysisOutput[];
  readonly sessionId: string | null;
}) {
  const [directory, setDirectory] = useState("/workspace");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const listing = useQuery({
    queryKey: workspaceFileKeys.directory(workspaceId, directory),
    queryFn: ({ signal }) => listWorkspaceFiles(workspaceId, directory, signal),
  });
  const parts = directory.split("/").filter(Boolean);
  const entry =
    listing.data?.entries.find((item) => item.file_path === selectedPath) ??
    null;

  function openDirectory(path: string) {
    setDirectory(path);
    setSelectedPath(null);
  }

  return (
    <section className="mt-8" aria-labelledby="workspace-files-title">
      <h2 id="workspace-files-title" className="mb-4 text-base font-semibold">
        {content.title}
      </h2>
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center gap-3 border-b border-border px-3 py-2">
          <nav
            aria-label={content.directory}
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-xs"
          >
            {parts.map((part, index) => (
              <span key={index} className="flex shrink-0 items-center gap-1">
                {index > 0 && (
                  <ChevronRight className="size-3 text-muted-foreground" />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 font-normal"
                  aria-current={
                    index === parts.length - 1 ? "location" : undefined
                  }
                  onClick={() =>
                    openDirectory(`/${parts.slice(0, index + 1).join("/")}`)
                  }
                >
                  {part}
                </Button>
              </span>
            ))}
          </nav>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={content.refresh}
            title={content.refresh}
            disabled={listing.isFetching}
            onClick={() => void listing.refetch()}
          >
            <RefreshCw
              className={cn("size-3.5", listing.isFetching && "animate-spin")}
            />
          </Button>
        </div>
        <div className="flex h-[640px] min-w-0 flex-col md:h-[480px] md:flex-row">
          <div
            className="h-48 shrink-0 overflow-y-auto border-b border-border p-2 md:h-auto md:w-72 md:border-r md:border-b-0"
            aria-label={content.directoryContents}
          >
            {listing.isPending ? (
              <p
                role="status"
                className="px-3 py-4 text-xs text-muted-foreground"
              >
                {content.loading}
              </p>
            ) : listing.isError ? (
              <p role="alert" className="px-3 py-4 text-xs text-destructive">
                {content.loadFailed}
              </p>
            ) : listing.data.entries.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                {content.empty}
              </p>
            ) : (
              listing.data.entries.map((item) => (
                <button
                  key={item.file_path}
                  type="button"
                  aria-pressed={
                    item.kind === "file"
                      ? entry?.file_path === item.file_path
                      : undefined
                  }
                  onClick={() =>
                    item.kind === "directory"
                      ? openDirectory(item.file_path)
                      : setSelectedPath(item.file_path)
                  }
                  title={item.name}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    entry?.file_path === item.file_path
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {item.kind === "directory" ? (
                    <FolderClosed className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <File className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.kind === "directory" ? (
                    <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatBytes(item.bytes!)}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
          {entry === null ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-sm text-muted-foreground">
              <FolderClosed className="size-8" strokeWidth={1.5} />
              <p>{content.selectFile}</p>
            </div>
          ) : (
            <WorkspaceFilePreview
              key={entry.file_path}
              entry={entry}
              workspaceId={workspaceId}
              output={outputs.find(
                (output) => output.file_path === entry.file_path,
              )}
              sessionId={sessionId}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
