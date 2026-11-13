import { Button } from "@/components/ui/button";
import type { AnalysisOutput } from "@/features/analysis/api";
import type { Workspace } from "@/features/workspaces/api";
import { DeleteResultDialog } from "@/features/workspaces/overview/DeleteResultDialog";
import { OverviewDialog } from "@/features/workspaces/overview/OverviewDialog";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { cn } from "@/lib/utils";
import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  ChevronRight,
  File,
  FolderClosed,
  Link2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
import { WorkspaceFilePreview } from "./WorkspaceFilePreview";
import { WorkspaceUploadDialog } from "./WorkspaceUploadDialog";
import {
  listWorkspaceFiles,
  workspaceFileKeys,
  type WorkspaceEntry,
} from "./files-api";
export const WorkspaceFileBrowser = defineComponent(
  (
    componentProps: {
      readonly workspace: Workspace;
      readonly outputs: readonly AnalysisOutput[];
      readonly sessionId: string | null;
      readonly location: {
        readonly path: string;
      } | null;
      readonly onSelectOutput: (id: string) => void;
    },
    { slots: _slots },
  ) => {
    const workspace = computed(() => componentProps.workspace),
      outputs = computed(() => componentProps.outputs),
      sessionId = computed(() => componentProps.sessionId),
      location = computed(() => componentProps.location),
      onSelectOutput = computed(() => componentProps.onSelectOutput);
    const directory = shallowRef("/workspace"),
      setDirectory = refSetter(directory);
    const selectedPath = shallowRef<string | null>(null),
      setSelectedPath = refSetter(selectedPath);
    const preview = shallowRef<WorkspaceEntry | null>(null),
      setPreview = refSetter(preview);
    const upload = shallowRef(false),
      setUpload = refSetter(upload);
    const removal = shallowRef<AnalysisOutput | null>(null),
      setRemoval = refSetter(removal);
    const listRef = shallowRef<HTMLDivElement | null>(null);
    const selectedRef = shallowRef<HTMLDivElement | null>(null);
    const client = useQueryClient();
    watchMounted([() => location.value], () => {
      if (location.value === null) return;
      setDirectory(
        location.value.path.slice(0, location.value.path.lastIndexOf("/")),
      );
      setSelectedPath(location.value.path);
    });
    const listing = reactive(
      useQuery(
        computed(() => ({
          queryKey: workspaceFileKeys.directory(
            workspace.value.id,
            directory.value,
          ),
          queryFn: ({ signal }: { signal: AbortSignal }) =>
            listWorkspaceFiles(workspace.value.id, directory.value, signal),
          refetchInterval: 5000,
        })),
      ),
    );
    const parts = computed(() => directory.value.split("/").filter(Boolean));
    watchMounted(
      [
        () => selectedPath.value,
        () => listing.data?.file_path,
        () => location.value,
      ],
      () => {
        const list = listRef.value;
        const row = selectedRef.value;
        if (list === null || row === null) return;
        list.scrollTop +=
          row.getBoundingClientRect().top -
          list.getBoundingClientRect().top -
          (list.clientHeight - row.offsetHeight) / 2;
      },
    );
    const openDirectory = (path: string) => {
      setDirectory(path);
      setSelectedPath(null);
    };
    return () => {
      const _parts = parts.value,
        _outputs = outputs.value,
        _onSelectOutput = onSelectOutput.value,
        _workspace = workspace.value,
        _sessionId = sessionId.value;
      return (
        <section class="overview-panel overview-files" aria-label={copy.files}>
          <header class="overview-panel-heading">
            <span class="overview-icon">
              <FolderClosed />
            </span>
            <div>
              <h2>{copy.files}</h2>
              <p>{copy.fileHint}</p>
            </div>
            <div class="ml-auto flex gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={copy.refresh}
                disabled={listing.isFetching}
                onClick={() => void listing.refetch()}
              >
                <RefreshCw
                  class={cn("size-3.5", listing.isFetching && "animate-spin")}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={copy.upload}
                onClick={() => setUpload(true)}
              >
                <Upload class="size-3.5" />
              </Button>
            </div>
          </header>
          <nav class="overview-file-breadcrumb" aria-label={copy.files}>
            {_parts.map((part, index) => (
              <span key={index}>
                {index > 0 && <ChevronRight class="size-3" />}
                <button
                  onClick={() =>
                    openDirectory(`/${_parts.slice(0, index + 1).join("/")}`)
                  }
                  aria-current={
                    index === _parts.length - 1 ? "location" : undefined
                  }
                  title={part}
                >
                  {index === 0 ? copy.root : part}
                </button>
              </span>
            ))}
          </nav>
          <div
            ref={listRef}
            class="overview-file-list"
            tabindex={0}
            aria-label={copy.files}
          >
            {listing.isPending ? (
              <p class="overview-message" role="status">
                {copy.loading}
              </p>
            ) : listing.isError ? (
              <p class="overview-message text-destructive" role="alert">
                {listing.error.message}
              </p>
            ) : listing.data.entries.length === 0 ? (
              <div class="overview-empty">
                <FolderClosed class="size-7 opacity-40" />
                <p>{copy.emptyFiles}</p>
              </div>
            ) : (
              listing.data.entries.map((item) => {
                const output = _outputs.find(
                  (output) => output.file_path === item.file_path,
                );
                const isFolder = item.kind === "directory";
                const category = item.name as keyof typeof copy.fileKinds;
                return (
                  <div
                    key={item.file_path}
                    ref={
                      selectedPath.value === item.file_path
                        ? selectedRef
                        : undefined
                    }
                    class={cn(
                      "overview-file-row",
                      selectedPath.value === item.file_path && "is-selected",
                    )}
                  >
                    <button
                      class="overview-file-open"
                      title={item.file_path}
                      aria-label={item.name}
                      onClick={() => {
                        if (isFolder) openDirectory(item.file_path);
                        else {
                          setSelectedPath(item.file_path);
                          setPreview(item);
                          if (output !== undefined) _onSelectOutput(output.id);
                        }
                      }}
                    >
                      <span
                        class={cn(
                          "overview-file-icon",
                          isFolder && `is-folder folder-${item.name}`,
                        )}
                      >
                        {isFolder ? <FolderClosed /> : <File />}
                      </span>
                      <span class="min-w-0 flex-1">
                        <strong>{item.name}</strong>
                        <span>
                          {isFolder
                            ? (copy.fileKinds[category] ?? copy.files)
                            : formatBytes(item.bytes!)}
                        </span>
                      </span>
                      {isFolder ? (
                        <ChevronRight class="size-3.5 opacity-40" />
                      ) : (
                        <time datetime={item.modified_at}>
                          {new Date(item.modified_at).toLocaleDateString(
                            "zh-CN",
                            {
                              month: "2-digit",
                              day: "2-digit",
                            },
                          )}
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
                            _onSelectOutput(output.id);
                          }}
                        >
                          <Link2 class="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={copy.linkedDelete}
                          onClick={() => setRemoval(output)}
                        >
                          <Trash2 class="size-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <footer class="overview-file-footer">
            <span>{listing.data?.entries.length ?? "—"} 项</span>
            <span class="truncate">{directory.value}</span>
          </footer>
          {preview.value !== null && (
            <OverviewDialog
              title={copy.preview}
              onClose={() => setPreview(null)}
            >
              <WorkspaceFilePreview
                entry={preview.value}
                workspaceId={_workspace.id}
                output={_outputs.find(
                  (output) => output.file_path === preview.value!.file_path,
                )}
                sessionId={_sessionId}
              />
            </OverviewDialog>
          )}
          {removal.value !== null && (
            <DeleteResultDialog
              output={removal.value}
              onClose={() => setRemoval(null)}
            />
          )}
          {upload.value && (
            <WorkspaceUploadDialog
              workspace={_workspace}
              onClose={() => {
                setUpload(false);
                void client.invalidateQueries({
                  queryKey: ["workspace-files", _workspace.id],
                });
              }}
            />
          )}
        </section>
      );
    };
  },
  {
    name: "WorkspaceFileBrowser",
    inheritAttrs: false,
    props: ["workspace", "outputs", "sessionId", "location", "onSelectOutput"],
  },
);
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
