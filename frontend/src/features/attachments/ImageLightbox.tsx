import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { Minus, Plus, X } from "lucide-vue-next";
import { computed, defineComponent, shallowRef, type VNodeChild } from "vue";
export const ImageLightbox = defineComponent(
  (
    componentProps: {
      readonly src: string;
      readonly name: string;
      readonly description: string;
      readonly onClose: () => void;
      readonly onError: () => void;
      readonly action?: VNodeChild;
    },
    { slots: _slots },
  ) => {
    const src = computed(() => componentProps.src),
      name = computed(() => componentProps.name),
      description = computed(() => componentProps.description),
      onClose = computed(() => componentProps.onClose),
      onError = computed(() => componentProps.onError),
      action = computed(() => componentProps.action);
    const stage = shallowRef<HTMLDivElement | null>(null);
    const natural = shallowRef({
        width: 0,
        height: 0,
      }),
      setNatural = refSetter(natural);
    const available = shallowRef({
        width: 0,
        height: 0,
      }),
      setAvailable = refSetter(available);
    const zoom = shallowRef(100),
      setZoom = refSetter(zoom);
    watchMounted([() => stage.value], () => {
      const element = stage.value;
      if (element === null) return;
      const measure = () =>
        setAvailable({
          width: element.offsetWidth,
          height: element.offsetHeight,
        });
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      measure();
      return () => observer.disconnect();
    });
    const fit = computed(() =>
      natural.value.width === 0
        ? 0
        : Math.min(
            available.value.width / natural.value.width,
            available.value.height / natural.value.height,
          ),
    );
    const width = computed(
      () => (natural.value.width * fit.value * zoom.value) / 100,
    );
    const height = computed(
      () => (natural.value.height * fit.value * zoom.value) / 100,
    );
    return () => {
      const _onClose = onClose.value,
        _name = name.value,
        _description = description.value,
        _width = width.value,
        _height = height.value,
        _src = src.value,
        _onError = onError.value,
        _action = action.value;
      return (
        <AlertDialog
          open
          onUpdate:open={(open) => {
            if (!open) _onClose();
          }}
        >
          <AlertDialogContent class="grid h-[85vh] max-w-[calc(100vw-2rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 p-4 sm:max-w-[90vw]">
            <div class="flex min-w-0 items-center justify-between gap-3">
              <AlertDialogTitle class="truncate text-sm">
                {_name}
              </AlertDialogTitle>
              <AlertDialogCancel asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={zhCN.conversation.attachments.close}
                >
                  <X class="size-4" />
                </Button>
              </AlertDialogCancel>
            </div>
            <AlertDialogDescription class="truncate">
              {_description}
            </AlertDialogDescription>
            <div
              ref={stage}
              class="min-h-0 min-w-0 overflow-auto"
              data-image-lightbox-stage
            >
              <div
                class="grid min-h-full min-w-full place-items-center"
                style={{
                  width: `${Math.max(_width, available.value.width)}px`,
                  height: `${Math.max(_height, available.value.height)}px`,
                }}
              >
                <img
                  src={_src}
                  alt={_name}
                  class="max-w-none object-contain"
                  style={{
                    width: `${_width}px`,
                    height: `${_height}px`,
                  }}
                  onLoad={(event) =>
                    setNatural({
                      width: (event.currentTarget as HTMLImageElement)
                        .naturalWidth,
                      height: (event.currentTarget as HTMLImageElement)
                        .naturalHeight,
                    })
                  }
                  onError={_onError}
                />
              </div>
            </div>
            <div class="flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                class="size-8"
                aria-label={zhCN.conversation.attachments.zoomOut}
                disabled={zoom.value === 25}
                onClick={() => setZoom((value) => Math.max(25, value - 25))}
              >
                <Minus class="size-4" />
              </Button>
              <button
                type="button"
                class="min-w-12 text-xs"
                aria-label={zhCN.conversation.attachments.resetZoom}
                onClick={() => setZoom(100)}
              >
                {zoom.value}%
              </button>
              <Button
                variant="ghost"
                size="icon"
                class="size-8"
                aria-label={zhCN.conversation.attachments.zoomIn}
                disabled={zoom.value === 400}
                onClick={() => setZoom((value) => Math.min(400, value + 25))}
              >
                <Plus class="size-4" />
              </Button>
              {_action}
            </div>
          </AlertDialogContent>
        </AlertDialog>
      );
    };
  },
  {
    name: "ImageLightbox",
    inheritAttrs: false,
    props: ["src", "name", "description", "onClose", "onError", "action"],
  },
);
