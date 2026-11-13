import { rasterCopy as copy } from "@/locales/zh-CN/raster-views";
import { computed, defineComponent } from "vue";
import type { RasterView } from "./raster-views";
export const RasterViewPicker = defineComponent(
  (
    componentProps: {
      readonly views: readonly RasterView[];
      readonly selected: string;
      readonly onSelect: (id: string) => void;
    },
    { slots: _slots },
  ) => {
    const views = computed(() => componentProps.views),
      selected = computed(() => componentProps.selected),
      onSelect = computed(() => componentProps.onSelect);
    const current = computed(() =>
      views.value.find((view) => view.id === selected.value)!,
    );
    const groups = computed(() => [
      ...new Set(views.value.map((view) => view.group)),
    ]);
    return () => {
      const _views = views.value,
        _groups = groups.value,
        _current = current.value,
        _onSelect = onSelect.value,
        _selected = selected.value;
      if (_views.length === 1) return null;
      return (
        <>
          <div
            class="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1"
            role="group"
            aria-label={copy.groups}
          >
            {_groups.map((group) => (
              <button
                type="button"
                key={group}
                aria-pressed={group === _current.group}
                class={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${group === _current.group ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() =>
                  _onSelect(_views.find((view) => view.group === group)!.id)
                }
              >
                {group}
              </button>
            ))}
          </div>
          <div
            class="flex flex-wrap gap-1"
            role="group"
            aria-label={copy.select}
          >
            {_views
              .filter((view) => view.group === _current.group)
              .map((view) => (
                <button
                  type="button"
                  key={view.id}
                  aria-pressed={view.id === _selected}
                  class={`rounded-full border px-2.5 py-1 text-[11px] ${view.id === _selected ? "border-primary/30 bg-primary/8 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted"}`}
                  onClick={() => _onSelect(view.id)}
                >
                  {view.title}
                </button>
              ))}
          </div>
        </>
      );
    };
  },
  {
    name: "RasterViewPicker",
    inheritAttrs: false,
    props: ["views", "selected", "onSelect"],
  },
);
