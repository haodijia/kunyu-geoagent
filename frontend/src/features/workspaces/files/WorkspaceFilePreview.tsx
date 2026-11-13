import { Button } from "@/components/ui/button";
import type { AnalysisOutput } from "@/features/analysis/api";
import { OutputCard } from "@/features/analysis/OutputCard";
import { CopyButton } from "@/features/messages/rendering/CopyButton";
import {
  readWorkspaceFile,
  type WorkspaceEntry,
} from "@/features/workspaces/files/files-api";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { Download, File, LoaderCircle } from "lucide-vue-next";
import { computed, defineComponent, shallowRef } from "vue";
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
export const WorkspaceFilePreview = defineComponent(
  (
    componentProps: {
      readonly entry: WorkspaceEntry;
      readonly workspaceId: string;
      readonly output: AnalysisOutput | undefined;
      readonly sessionId: string | null;
    },
    { slots: _slots },
  ) => {
    const entry = computed(() => componentProps.entry),
      workspaceId = computed(() => componentProps.workspaceId),
      output = computed(() => componentProps.output),
      sessionId = computed(() => componentProps.sessionId);
    const downloading = shallowRef(false),
      setDownloading = refSetter(downloading);
    const error = shallowRef<string | null>(null),
      setError = refSetter(error);
    async function download() {
      setDownloading(true);
      setError(null);
      try {
        const blob = await readWorkspaceFile(
          workspaceId.value,
          entry.value.file_path,
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = entry.value.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (reason) {
        console.error("[workspaces] File download failed.", {
          path: entry.value.file_path,
          reason,
        });
        setError(content.downloadFailed);
      } finally {
        setDownloading(false);
      }
    }
    return () => {
      const _entry = entry.value,
        _output = output.value,
        _workspaceId = workspaceId.value,
        _sessionId = sessionId.value;
      return (
        <section
          class="flex min-h-0 min-w-0 flex-1 flex-col"
          aria-label={content.preview}
        >
          <header class="flex min-w-0 items-center gap-2 border-b border-border px-4 py-3">
            <div class="min-w-0 flex-1">
              <h3 class="truncate text-sm font-medium" title={_entry.name}>
                {_entry.name}
              </h3>
              <p
                class="mt-1 truncate text-xs text-muted-foreground"
                title={_entry.file_path}
              >
                {_entry.file_path}
              </p>
            </div>
            <CopyButton text={_entry.file_path} />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={downloading.value}
              aria-label={content.download}
              title={content.download}
              onClick={() => void download()}
            >
              {downloading.value ? (
                <LoaderCircle class="size-4 animate-spin" />
              ) : (
                <Download class="size-4" />
              )}
            </Button>
          </header>
          {error.value !== null && (
            <p role="alert" class="px-4 pt-3 text-xs text-destructive">
              {error.value}
            </p>
          )}
          <div class="min-h-0 flex-1 overflow-auto p-4">
            {_output !== undefined ? (
              <OutputCard
                output={_output}
                workspaceId={_workspaceId}
                sessionId={_sessionId}
                compact
              />
            ) : (
              <FileContent entry={_entry} workspaceId={_workspaceId} />
            )}
          </div>
        </section>
      );
    };
  },
  {
    name: "WorkspaceFilePreview",
    inheritAttrs: false,
    props: ["entry", "workspaceId", "output", "sessionId"],
  },
);
const FileContent = defineComponent(
  (
    componentProps: {
      readonly entry: WorkspaceEntry;
      readonly workspaceId: string;
    },
    { slots: _slots },
  ) => {
    const entry = computed(() => componentProps.entry),
      workspaceId = computed(() => componentProps.workspaceId);
    const kind = computed(() => previewKind(entry.value));
    const limit = computed(() =>
      kind.value === "text" ? textLimit : mediaLimit,
    );
    const tooLarge = computed(() => (entry.value.bytes ?? 0) > limit.value);
    const preview = shallowRef<{
        url: string;
        text: string | null;
      } | null>(null),
      setPreview = refSetter(preview);
    const failed = shallowRef(false),
      setFailed = refSetter(failed);
    watchMounted(
      [
        () => workspaceId.value,
        () => entry.value.file_path,
        () => entry.value.modified_at,
        () => kind.value,
        () => limit.value,
        () => tooLarge.value,
      ],
      () => {
        if (kind.value === "unsupported" || tooLarge.value) return;
        const controller = new AbortController();
        let objectUrl: string | null = null;
        setPreview(null);
        setFailed(false);
        void readWorkspaceFile(
          workspaceId.value,
          entry.value.file_path,
          controller.signal,
          limit.value,
        )
          .then(async (blob) => {
            const text =
              kind.value === "text"
                ? new TextDecoder("utf-8", {
                    fatal: true,
                  }).decode(await blob.arrayBuffer())
                : null;
            if (controller.signal.aborted) return;
            objectUrl = URL.createObjectURL(blob);
            setPreview({
              url: objectUrl,
              text,
            });
          })
          .catch((reason) => {
            if (controller.signal.aborted) return;
            console.error("[workspaces] File preview failed.", {
              path: entry.value.file_path,
              reason,
            });
            setFailed(true);
          });
        return () => {
          controller.abort();
          if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
        };
      },
    );
    return () => {
      const _kind = kind.value,
        _tooLarge = tooLarge.value,
        _entry2 = entry.value;
      if (_kind === "unsupported" || _tooLarge)
        return (
          <div class="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <File class="size-8" strokeWidth={1.5} />
            <p>{_tooLarge ? content.tooLarge : content.unsupported}</p>
          </div>
        );
      if (failed.value)
        return (
          <p role="alert" class="text-sm text-destructive">
            {content.previewFailed}
          </p>
        );
      if (preview.value === null)
        return (
          <p
            role="status"
            class="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <LoaderCircle class="size-4 animate-spin" />
            {content.loadingPreview}
          </p>
        );
      if (_kind === "text")
        return (
          <pre class="m-0 whitespace-pre-wrap break-words font-mono text-xs leading-6">
            {preview.value.text}
          </pre>
        );
      if (_kind === "pdf")
        return (
          <iframe
            src={preview.value.url}
            title={_entry2.name}
            class="h-full min-h-80 w-full rounded-md border-0"
          />
        );
      return (
        <img
          src={preview.value.url}
          alt={_entry2.name}
          class="h-full max-h-[400px] w-full rounded-md bg-muted object-contain"
          onError={() => {
            console.error("[workspaces] Image decoding failed.", {
              path: _entry2.file_path,
            });
            setFailed(true);
          }}
        />
      );
    };
  },
  {
    name: "FileContent",
    inheritAttrs: false,
    props: ["entry", "workspaceId"],
  },
);
