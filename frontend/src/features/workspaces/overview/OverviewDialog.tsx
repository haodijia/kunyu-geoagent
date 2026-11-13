import { Button } from "@/components/ui/button";
import { watchMounted } from "@/lib/lifecycle";
import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";
import { X } from "lucide-vue-next";
import { computed, defineComponent, shallowRef, type VNodeChild } from "vue";
export const OverviewDialog = defineComponent(
  (
    componentProps: {
      readonly title: string;
      readonly children?: VNodeChild;
      readonly onClose: () => void;
    },
    { slots },
  ) => {
    const title = computed(() => componentProps.title),
      children = () => slots.default?.(),
      onClose = computed(() => componentProps.onClose);
    const ref = shallowRef<HTMLDialogElement | null>(null);
    watchMounted([], () => {
      const dialog = ref.value!;
      dialog.showModal();
      return () => dialog.close();
    });
    return () => {
      const _title = title.value,
        _onClose = onClose.value;
      return (
        <dialog
          ref={ref}
          aria-label={_title}
          onCancel={(event) => {
            event.preventDefault();
            _onClose();
          }}
          class="overview-dialog m-auto flex-col overflow-hidden rounded-2xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/35 backdrop:backdrop-blur-sm"
        >
          <header class="flex shrink-0 items-center justify-between gap-4 border-b border-border/70 px-5 py-3">
            <h2 class="truncate text-sm font-medium">{_title}</h2>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={_onClose}
              aria-label={copy.close}
            >
              <X class="size-4" />
            </Button>
          </header>
          <div class="flex min-h-0 flex-1 flex-col overflow-auto">
            {children()}
          </div>
        </dialog>
      );
    };
  },
  {
    name: "OverviewDialog",
    inheritAttrs: false,
    props: ["title", "onClose"],
  },
);
