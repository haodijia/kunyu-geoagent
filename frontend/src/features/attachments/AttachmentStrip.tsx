import { Button } from "@/components/ui/button";
import {
  readAttachment,
  readAttachmentOriginal,
  type Attachment,
} from "@/features/attachments/api";
import { ImageLightbox } from "@/features/attachments/ImageLightbox";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ImageOff,
  LoaderCircle,
  X,
} from "lucide-vue-next";
import { computed, defineComponent, shallowRef } from "vue";
import { toast } from "vue-sonner";
const content = zhCN.conversation.attachments;
export const AttachmentStrip = defineComponent(
  (
    componentProps: {
      readonly sessionId: string;
      readonly attachments: readonly Attachment[];
      readonly offloadedIds?: ReadonlySet<string>;
      readonly disabled?: boolean;
      readonly onRemove?: (id: string) => void;
      readonly imageLayout?: "thumbnail" | "preview";
    },
    { slots: _slots },
  ) => {
    const sessionId = computed(() => componentProps.sessionId),
      attachments = computed(() => componentProps.attachments),
      disabled = computed(() =>
        componentProps.disabled === undefined ? false : componentProps.disabled,
      ),
      onRemove = computed(() => componentProps.onRemove),
      offloadedIds = computed(() => componentProps.offloadedIds),
      imageLayout = computed(() =>
        componentProps.imageLayout === undefined
          ? "thumbnail"
          : componentProps.imageLayout,
      );
    const scrollRef = shallowRef<HTMLDivElement | null>(null);
    const edges = shallowRef({
        left: false,
        right: false,
      }),
      setEdges = refSetter(edges);
    watchMounted([() => attachments.value], () => {
      const scroller = scrollRef.value;
      if (scroller === null) return;
      const update = () =>
        setEdges({
          left: scroller.scrollLeft > 1,
          right:
            scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft >
            1,
        });
      update();
      const observer = new ResizeObserver(update);
      observer.observe(scroller);
      scroller.addEventListener("scroll", update, {
        passive: true,
      });
      return () => {
        observer.disconnect();
        scroller.removeEventListener("scroll", update);
      };
    });
    return () => {
      const _attachments = attachments.value,
        _imageLayout = imageLayout.value,
        _sessionId = sessionId.value,
        _offloadedIds = offloadedIds.value,
        _disabled = disabled.value,
        _onRemove = onRemove.value;
      if (_attachments.length === 0) return null;
      return (
        <div class="relative min-w-0 max-w-full">
          <div
            ref={scrollRef}
            aria-label={content.list}
            class={`flex min-w-0 max-w-full gap-2 overflow-x-auto py-1.5 [scrollbar-width:none] ${_imageLayout === "preview" ? "flex-col items-start" : "items-center"}`}
          >
            {_attachments.map((ref) => (
              <AttachmentCard
                key={ref.id}
                sessionId={_sessionId}
                attachment={ref}
                offloaded={_offloadedIds?.has(ref.id) === true}
                disabled={_disabled}
                onRemove={_onRemove}
                imageLayout={_imageLayout}
              />
            ))}
          </div>
          {edges.value.left && (
            <div class="pointer-events-none absolute inset-y-0 left-0 flex w-[60px] items-center bg-[linear-gradient(to_left,transparent,var(--attachment-surface,var(--mu-composer-bg))_70%)]">
              <Button
                type="button"
                size="icon"
                variant="outline"
                class="pointer-events-auto size-7 rounded-full bg-background shadow-sm"
                aria-label={content.scrollLeft}
                onClick={() =>
                  scrollRef.value?.scrollBy({
                    left: -200,
                    behavior: "smooth",
                  })
                }
              >
                <ChevronLeft class="size-3.5" />
              </Button>
            </div>
          )}
          {edges.value.right && (
            <div class="pointer-events-none absolute inset-y-0 right-0 flex w-[60px] items-center justify-end bg-[linear-gradient(to_right,transparent,var(--attachment-surface,var(--mu-composer-bg))_70%)]">
              <Button
                type="button"
                size="icon"
                variant="outline"
                class="pointer-events-auto size-7 rounded-full bg-background shadow-sm"
                aria-label={content.scrollRight}
                onClick={() =>
                  scrollRef.value?.scrollBy({
                    left: 200,
                    behavior: "smooth",
                  })
                }
              >
                <ChevronRight class="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      );
    };
  },
  {
    name: "AttachmentStrip",
    inheritAttrs: false,
    props: [
      "sessionId",
      "attachments",
      "disabled",
      "onRemove",
      "offloadedIds",
      "imageLayout",
    ],
  },
);
const AttachmentCard = defineComponent(
  (
    componentProps: {
      readonly sessionId: string;
      readonly attachment: Attachment;
      readonly disabled: boolean;
      readonly offloaded: boolean;
      readonly onRemove: ((id: string) => void) | undefined;
      readonly imageLayout: "thumbnail" | "preview";
    },
    { slots: _slots },
  ) => {
    const sessionId = computed(() => componentProps.sessionId),
      ref = computed(() => componentProps.attachment),
      disabled = computed(() => componentProps.disabled),
      onRemove = computed(() => componentProps.onRemove),
      offloaded = computed(() => componentProps.offloaded),
      imageLayout = computed(() => componentProps.imageLayout);
    const url = shallowRef<string | null>(null),
      setUrl = refSetter(url);
    const failed = shallowRef(false),
      setFailed = refSetter(failed);
    const preview = shallowRef(false),
      setPreview = refSetter(preview);
    const downloading = shallowRef(false),
      setDownloading = refSetter(downloading);
    watchMounted(
      [() => sessionId.value, () => ref.value.id, () => ref.value.kind],
      () => {
        if (ref.value.kind !== "image") return;
        const controller = new AbortController();
        let objectUrl: string | null = null;
        setUrl(null);
        setFailed(false);
        void readAttachment(sessionId.value, ref.value.id, controller.signal)
          .then((blob) => {
            if (controller.signal.aborted) return;
            objectUrl = URL.createObjectURL(blob);
            setUrl(objectUrl);
          })
          .catch((error) => {
            if (controller.signal.aborted) return;
            console.error("[attachments] Preview failed.", {
              sessionId: sessionId.value,
              attachmentId: ref.value.id,
              error,
            });
            setFailed(true);
          });
        return () => {
          controller.abort();
          if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
        };
      },
    );
    async function download() {
      if (downloading.value) return;
      setDownloading(true);
      try {
        const blob = await readAttachmentOriginal(
          sessionId.value,
          ref.value.id,
        );
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = ref.value.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch (error) {
        console.error("[attachments] Download failed.", {
          sessionId: sessionId.value,
          attachmentId: ref.value.id,
          error,
        });
        toast.error(content.downloadFailed);
      } finally {
        setDownloading(false);
      }
    }
    return () => {
      const _imageLayout2 = imageLayout.value,
        _ref = ref.value,
        _disabled2 = disabled.value,
        _offloaded = offloaded.value,
        _onRemove2 = onRemove.value;
      return (
        <div
          class={`relative shrink-0 ${_imageLayout2 === "preview" && _ref.kind === "image" ? "w-full max-w-lg" : ""}`}
          data-attachment-id={_ref.id}
        >
          {_ref.kind === "image" ? (
            <Button
              type="button"
              variant="ghost"
              class={`overflow-hidden rounded-lg bg-accent p-0 ${_imageLayout2 === "preview" ? "h-auto min-h-16 w-full" : "size-[60px] border border-border"}`}
              disabled={_disabled2 || url.value === null}
              onClick={() => setPreview(true)}
              aria-label={content.preview(_ref.name)}
              title={
                _offloaded ? `${_ref.name} · ${content.offloaded}` : _ref.name
              }
            >
              {url.value !== null ? (
                <img
                  src={url.value}
                  alt={_ref.name}
                  class={
                    _imageLayout2 === "preview"
                      ? "max-h-64 w-full object-contain"
                      : "size-full object-cover"
                  }
                  onError={() => {
                    console.error("[attachments] Image decoding failed.", {
                      attachmentId: _ref.id,
                    });
                    setFailed(true);
                    setUrl(null);
                  }}
                />
              ) : failed.value ? (
                <span class="px-1 text-[10px] text-destructive">
                  {content.previewFailed}
                </span>
              ) : (
                <LoaderCircle class="size-4 animate-spin" />
              )}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void download()}
              disabled={downloading.value}
              class="flex h-[60px] max-w-[250px] gap-3 rounded-lg border border-border bg-accent px-3 text-left"
              title={_ref.name}
              aria-label={content.download(_ref.name)}
            >
              {downloading.value ? (
                <LoaderCircle class="size-7 shrink-0 animate-spin" />
              ) : (
                <FileText
                  class="size-7 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
              )}
              <span class="flex min-w-0 flex-col gap-0.5">
                <span class="max-w-[150px] truncate text-[13px] font-normal">
                  {_ref.name}
                </span>
                <span class="text-[11px] font-normal text-muted-foreground">
                  {formatBytes(_ref.bytes)}
                </span>
              </span>
            </Button>
          )}
          {_offloaded && (
            <span
              class="pointer-events-none absolute right-1 bottom-1 rounded bg-background/90 p-0.5 text-muted-foreground"
              aria-label={content.offloaded}
            >
              <ImageOff class="size-3" />
            </span>
          )}
          {_onRemove2 !== undefined && (
            <button
              type="button"
              disabled={_disabled2}
              aria-label={content.remove(_ref.name)}
              onClick={() => _onRemove2(_ref.id)}
              class="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground disabled:opacity-50"
            >
              <X class="size-2.5" />
            </button>
          )}
          {preview.value && url.value !== null && _ref.kind === "image" && (
            <ImageLightbox
              src={url.value}
              name={_ref.name}
              description={`${_ref.width} × ${_ref.height} · ${formatBytes(_ref.bytes)}`}
              onClose={() => setPreview(false)}
              onError={() => {
                console.error("[attachments] Image decoding failed.", {
                  attachmentId: _ref.id,
                });
                setFailed(true);
                setPreview(false);
                setUrl(null);
              }}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={downloading.value}
                  onClick={() => void download()}
                >
                  <Download class="size-3.5" />
                  {content.downloadLabel}
                </Button>
              }
            />
          )}
        </div>
      );
    };
  },
  {
    name: "AttachmentCard",
    inheritAttrs: false,
    props: [
      "sessionId",
      "attachment",
      "disabled",
      "onRemove",
      "offloaded",
      "imageLayout",
    ],
  },
);
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
