import { Button } from "@/components/ui/button";
import { CopyButton } from "@/features/messages/rendering/CopyButton";
import type { Workspace } from "@/features/workspaces/api";
import {
  uploadWorkspaceFile,
  type WorkspaceFile,
} from "@/features/workspaces/files/files-api";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { Check, FileText, Image, Upload, X } from "lucide-vue-next";
import { computed, defineComponent, shallowRef, useId } from "vue";
const text = zhCN.workspaceFiles;
type UploadItem = {
  readonly id: string;
  readonly file: File;
  readonly status:
    "queued" | "uploading" | "completed" | "failed" | "cancelled";
  readonly receipt: WorkspaceFile | null;
  readonly error: string | null;
};
export const WorkspaceUploadDialog = defineComponent(
  (
    componentProps: {
      readonly workspace: Workspace;
      readonly onClose: () => void;
    },
    { slots: _slots },
  ) => {
    const workspace = computed(() => componentProps.workspace),
      onClose = computed(() => componentProps.onClose);
    const dialog = shallowRef<HTMLDialogElement | null>(null);
    const picker = shallowRef<HTMLInputElement | null>(null);
    const controller = shallowRef<AbortController | null>(null);
    const titleId = useId();
    const items = shallowRef<readonly UploadItem[]>([]),
      setItems = refSetter(items);
    const busy = shallowRef(false),
      setBusy = refSetter(busy);
    watchMounted([], () => {
      const element = dialog.value;
      if (element === null) return;
      element.showModal();
      return () => element.close();
    });
    watchMounted([], () => () => controller.value?.abort());
    function update(id: string, changes: Partial<UploadItem>) {
      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                ...changes,
              }
            : item,
        ),
      );
    }
    async function upload(files: readonly File[]) {
      if (controller.value !== null || files.length === 0) return;
      const next: UploadItem[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "queued",
        receipt: null,
        error: null,
      }));
      const abort = new AbortController();
      controller.value = abort;
      setItems((current) => [...current, ...next]);
      setBusy(true);
      try {
        for (const item of next) {
          if (abort.signal.aborted) {
            update(item.id, {
              status: "cancelled",
            });
            continue;
          }
          update(item.id, {
            status: "uploading",
          });
          try {
            const receipt = await uploadWorkspaceFile(
              workspace.value.id,
              item.file,
              abort.signal,
            );
            update(item.id, {
              status: "completed",
              receipt,
            });
          } catch (error) {
            if (abort.signal.aborted)
              update(item.id, {
                status: "cancelled",
              });
            else {
              console.error("[workspaces] File upload failed", error);
              update(item.id, {
                status: "failed",
                error:
                  error instanceof Error ? error.message : text.uploadFailed,
              });
            }
          }
        }
      } finally {
        controller.value = null;
        setBusy(false);
      }
    }
    function close() {
      controller.value?.abort();
      onClose.value();
    }
    const finished = computed(
      () =>
        items.value.filter(
          (item) => item.status !== "queued" && item.status !== "uploading",
        ).length,
    );
    return () => {
      const _workspace = workspace.value,
        _finished = finished.value;
      return (
        <dialog
          ref={dialog}
          aria-labelledby={titleId}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onKeydown={(event) => event.stopPropagation()}
          onDragover={(event) => event.preventDefault()}
          onDrop={(event) => event.preventDefault()}
          class="m-auto w-[min(560px,calc(100%_-_32px))] max-h-[80dvh] rounded-[16px] border border-border bg-popover p-0 text-foreground shadow-xl backdrop:bg-black/30"
        >
          <div class="flex max-h-[80dvh] flex-col">
            <header class="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
              <div class="min-w-0 flex-1">
                <h2 id={titleId} class="m-0 text-[15px] font-medium">
                  {text.title}
                </h2>
                <p class="m-0 mt-1 truncate text-xs text-muted-foreground">
                  {_workspace.name}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={text.close}
                onClick={close}
              >
                <X class="size-4" />
              </Button>
            </header>
            <div class="min-h-0 overflow-y-auto px-5 py-4">
              <p class="m-0 text-[13px] leading-5 text-muted-foreground">
                {text.description}
              </p>
              <input
                ref={picker}
                type="file"
                multiple
                class="hidden"
                aria-label={text.choose}
                onInput={(event) => {
                  const files = Array.from(
                    (event.currentTarget as HTMLInputElement).files ?? [],
                  );
                  (event.currentTarget as HTMLInputElement).value = "";
                  void upload(files);
                }}
              />
              <button
                type="button"
                disabled={busy.value}
                onClick={() => picker.value?.click()}
                onDragover={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!busy.value)
                    void upload(Array.from(event.dataTransfer!.files));
                }}
                class="mt-4 flex w-full cursor-pointer flex-col items-center gap-2 rounded-[12px] border border-dashed border-border bg-muted/30 px-4 py-6 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 disabled:cursor-default disabled:opacity-50"
              >
                <Upload class="size-5" aria-hidden="true" />
                <span>{text.chooseOrDrop}</span>
                <span class="text-xs">{text.limit}</span>
              </button>
              {items.value.length > 0 && (
                <div class="mt-4 space-y-2" aria-live="polite">
                  {busy.value && (
                    <div class="mb-3">
                      <div class="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>{text.uploading}</span>
                        <span>
                          {_finished} / {items.value.length}
                        </span>
                      </div>
                      <div class="h-[3px] overflow-hidden rounded-full bg-muted">
                        <div
                          class="h-full bg-primary transition-[width]"
                          style={{
                            width: `${(_finished / items.value.length) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {items.value.map((item) => (
                    <div
                      key={item.id}
                      class="flex items-start gap-3 rounded-[8px] border border-border px-3 py-2.5"
                    >
                      {item.file.type.startsWith("image/") ? (
                        <Image class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileText class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                      <div class="min-w-0 flex-1">
                        <div
                          class="truncate text-[13px]"
                          title={item.file.name}
                        >
                          {item.receipt === null
                            ? item.file.name
                            : item.receipt.name}
                        </div>
                        <div class="mt-0.5 text-xs text-muted-foreground">
                          {text.status[item.status]}
                        </div>
                        {item.receipt !== null && (
                          <code class="mt-1 block break-all text-xs text-muted-foreground">
                            {item.receipt.file_path}
                          </code>
                        )}
                        {item.error !== null && (
                          <p
                            class="m-0 mt-1 text-xs leading-4 text-destructive"
                            role="alert"
                          >
                            {item.error}
                          </p>
                        )}
                      </div>
                      {item.receipt !== null && (
                        <>
                          <Check
                            class="mt-1 size-4 shrink-0 text-success"
                            aria-label={text.saved}
                          />
                          <CopyButton text={item.receipt.file_path} />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <footer class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
              {busy.value && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => controller.value?.abort()}
                >
                  {text.cancelUploads}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy.value}
                onClick={close}
              >
                {text.done}
              </Button>
            </footer>
          </div>
        </dialog>
      );
    };
  },
  {
    name: "WorkspaceUploadDialog",
    inheritAttrs: false,
    props: ["workspace", "onClose"],
  },
);
