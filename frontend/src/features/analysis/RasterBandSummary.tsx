import { rasterCopy as copy } from "@/locales/zh-CN/raster-views";
import { computed, defineComponent } from "vue";
import type { AnalysisOutput } from "./api";
import type { RasterView } from "./raster-views";
export const RasterBandSummary = defineComponent(
  (
    componentProps: {
      readonly output: AnalysisOutput;
      readonly view: RasterView;
    },
    { slots: _slots },
  ) => {
    const output = computed(() => componentProps.output),
      view = computed(() => componentProps.view);
    return () => {
      const _view = view.value,
        _output = output.value;
      return (
        <div class="space-y-3 rounded-lg bg-muted/40 p-3 text-xs">
          {[...new Set(_view.bands)].map((index) => {
            const band = _output.metadata.bands[index - 1]!;
            const summary = band.summary;
            const pixelArea = summary.grid_pixel_area_m2;
            return (
              <div key={index} class="space-y-2">
                <div class="flex justify-between gap-3 text-muted-foreground">
                  <span>
                    {band.title}
                    {band.unit === null ? "" : ` · ${band.unit}`}
                  </span>
                  <span>
                    {copy.validPixels} {summary.valid_pixels.toLocaleString()}
                  </span>
                </div>
                {_view.style.type === "classified" ? (
                  <div class="space-y-1.5">
                    <div class="text-right text-[10px] text-muted-foreground">
                      {pixelArea === undefined
                        ? copy.count
                        : `${copy.gridArea} · km²`}
                    </div>
                    {_view.style.classes.map((category) => {
                      const count = summary.value_counts.find(
                        (value) => value.value === category.value,
                      )!.pixel_count;
                      return (
                        <div
                          key={category.value}
                          class="flex items-center justify-between gap-3"
                        >
                          <span class="flex items-center gap-1.5">
                            <span
                              class="size-2 rounded-full"
                              style={{
                                background: category.color,
                              }}
                            />
                            {category.label}
                          </span>
                          <span class="tabular-nums">
                            {pixelArea === undefined
                              ? count.toLocaleString()
                              : ((count * pixelArea) / 1e6).toFixed(3)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div class="grid grid-cols-3 gap-2">
                    {[
                      [copy.minimum, summary.minimum],
                      [copy.maximum, summary.maximum],
                      [copy.mean, summary.mean],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <p class="text-[10px] text-muted-foreground">{label}</p>
                        <p class="mt-1 tabular-nums">
                          {typeof value === "number"
                            ? Number(value.toPrecision(5))
                            : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    };
  },
  {
    name: "RasterBandSummary",
    inheritAttrs: false,
    props: ["output", "view"],
  },
);
