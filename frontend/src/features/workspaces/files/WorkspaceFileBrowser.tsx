import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  File,
  FolderClosed,
  Link2,
  RefreshCw,
  Upload,
  Trash2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AnalysisOutput } from "@/features/analysis/api";
import type { Workspace } from "@/features/workspaces/api";
import { WorkspaceFilePreview } from "./WorkspaceFilePreview";
import { WorkspaceUploadDialog } from "./WorkspaceUploadDialog";
import {
  listWorkspaceFiles,
  workspaceFileKeys,
  type WorkspaceEntry,
} from "./files-api";
import { OverviewDialog } from "@/features/workspaces/overview/OverviewDialog";
import { DeleteResultDialog } from "@/features/workspaces/overview/DeleteResultDialog";
import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";
import { cn } from "@/lib/utils";

export function WorkspaceFileBrowser({
  workspace,
  outputs,
  sessionId,
  location,
  onSelectOutput,
}: {
  readonly workspace: Workspace;
  readonly outputs: readonly AnalysisOutput[];
  readonly sessionId: string | null;
  readonly location: { readonly path: string } | null;
  readonly onSelectOutput: (id: string) => void;
}) {
  const [directory, setDirectory] = useState("/workspace");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<WorkspaceEntry | null>(null);
  const [upload, setUpload] = useState(false);
  const [removal, setRemoval] = useState<AnalysisOutput | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  useEffect(() => {
    if (location === null) return;
    setDirectory(location.path.slice(0, location.path.lastIndexOf("/")));
    setSelectedPath(location.path);
  }, [location]);
  const listing = useQuery({
    queryKey: workspaceFileKeys.directory(workspace.id, directory),
    queryFn: ({ signal }) =>
      listWorkspaceFiles(workspace.id, directory, signal),
    refetchInterval: 5000,
  });
  const parts = directory.split("/").filter(Boolean);
  useLayoutEffect(() => {
    const list = listRef.current;
    const row = selectedRef.current;
    if (list === null || row === null) return;
    list.scrollTop +=
      row.getBoundingClientRect().top -
      list.getBoundingClientRect().top -
      (list.clientHeight - row.offsetHeight) / 2;
  }, [selectedPath, listing.data?.file_path, location]);
  const openDirectory = (path: string) => {
    setDirectory(path);
    setSelectedPath(null);
  };
  return (
    <section className="overview-panel overview-files" aria-label={copy.files}>
      <header className="overview-panel-heading">
        <span className="overview-icon">
          <FolderClosed />
        </span>
        <div>
          <h2>{copy.files}</h2>
          <p>{copy.fileHint}</p>
        </div>
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={copy.refresh}
            disabled={listing.isFetching}
            onClick={() => void listing.refetch()}
          >
            <RefreshCw
              className={cn("size-3.5", listing.isFetching && "animate-spin")}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={copy.upload}
            onClick={() => setUpload(true)}
          >
            <Upload className="size-3.5" />
          </Button>
        </div>
      </header>
      <nav className="overview-file-breadcrumb" aria-label={copy.files}>
        {parts.map((part, index) => (
          <span key={index}>
            {index > 0 && <ChevronRight className="size-3" />}
            <button
              onClick={() =>
                openDirectory(`/${parts.slice(0, index + 1).join("/")}`)
              }
              aria-current={index === parts.length - 1 ? "location" : undefined}
              title={part}
            >
              {index === 0 ? copy.root : part}
            </button>
          </span>
        ))}
      </nav>
      <div
        ref={listRef}
        className="overview-file-list"
        tabIndex={0}
        aria-label={copy.files}
      >
        {listing.isPending ? (
          <p className="overview-message" role="status">
            {copy.loading}
          </p>
        ) : listing.isError ? (
          <p className="overview-message text-destructive" role="alert">
            {listing.error.message}
          </p>
        ) : listing.data.entries.length === 0 ? (
          <div className="overview-empty">
            <FolderClosed className="size-7 opacity-40" />
            <p>{copy.emptyFiles}</p>
          </div>
        ) : (
          listing.data.entries.map((item) => {
            const output = outputs.find(
              (output) => output.file_path === item.file_path,
            );
            const isFolder = item.kind === "directory";
            const category = item.name as keyof typeof copy.fileKinds;
            return (
              <div
                key={item.file_path}
                ref={selectedPath === item.file_path ? selectedRef : undefined}
                className={cn(
                  "overview-file-row",
                  selectedPath === item.file_path && "is-selected",
                )}
              >
                <button
                  className="overview-file-open"
                  title={item.file_path}
                  aria-label={item.name}
                  onClick={() => {
                    if (isFolder) openDirectory(item.file_path);
                    else {
                      setSelectedPath(item.file_path);
                      setPreview(item);
                      if (output !== undefined) onSelectOutput(output.id);
                    }
                  }}
                >
                  <span
                    className={cn(
                      "overview-file-icon",
                      isFolder && `is-folder folder-${item.name}`,
                    )}
                  >
                    {isFolder ? <FolderClosed /> : <File />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong>{item.name}</strong>
                    <span>
                      {isFolder
                        ? (copy.fileKinds[category] ?? copy.files)
                        : formatBytes(item.bytes!)}
                    </span>
                  </span>
                  {isFolder ? (
                    <ChevronRight className="size-3.5 opacity-40" />
                  ) : (
                    <time dateTime={item.modified_at}>
                      {new Date(item.modified_at).toLocaleDateString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </time>
                  )}
                </button>
                {output !== undefined && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${copy.details} · ${output.title}`}
                      onClick={() => {
                        setSelectedPath(item.file_path);
                        onSelectOutput(output.id);
                      }}
                    >
                      <Link2 className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={copy.linkedDelete}
                      onClick={() => setRemoval(output)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
      <footer className="overview-file-footer">
        <span>{listing.data?.entries.length ?? "—"} 项</span>
        <span className="truncate">{directory}</span>
      </footer>
      {preview !== null && (
        <OverviewDialog title={copy.preview} onClose={() => setPreview(null)}>
          <WorkspaceFilePreview
            entry={preview}
            workspaceId={workspace.id}
            output={outputs.find(
              (output) => output.file_path === preview.file_path,
            )}
            sessionId={sessionId}
          />
        </OverviewDialog>
      )}
      {removal !== null && (
        <DeleteResultDialog output={removal} onClose={() => setRemoval(null)} />
      )}
      {upload && (
        <WorkspaceUploadDialog
          workspace={workspace}
          onClose={() => {
            setUpload(false);
            void client.invalidateQueries({
              queryKey: ["workspace-files", workspace.id],
            });
          }}
        />
      )}
    </section>
  );
}
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
