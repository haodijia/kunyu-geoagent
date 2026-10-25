import type { AnalysisOutput } from "./api";
import type { RasterView } from "./raster-views";
import { rasterCopy as copy } from "@/locales/zh-CN/raster-views";

export function RasterBandSummary({
  output,
  view,
}: {
  readonly output: AnalysisOutput;
  readonly view: RasterView;
}) {
  return (
    <div className="space-y-3 rounded-lg bg-muted/40 p-3 text-xs">
      {[...new Set(view.bands)].map((index) => {
        const band = output.metadata.bands[index - 1]!;
        const summary = band.summary;
        const pixelArea = summary.grid_pixel_area_m2;
        return (
          <div key={index} className="space-y-2">
            <div className="flex justify-between gap-3 text-muted-foreground">
              <span>
                {band.title}
                {band.unit === null ? "" : ` · ${band.unit}`}
              </span>
              <span>
                {copy.validPixels} {summary.valid_pixels.toLocaleString()}
              </span>
            </div>
            {view.style.type === "classified" ? (
              <div className="space-y-1.5">
                <div className="text-right text-[10px] text-muted-foreground">
                  {pixelArea === undefined
                    ? copy.count
                    : `${copy.gridArea} · km²`}
                </div>
                {view.style.classes.map((category) => {
                  const count = summary.value_counts.find(
                    (value) => value.value === category.value,
                  )!.pixel_count;
                  return (
                    <div
                      key={category.value}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: category.color }}
                        />
                        {category.label}
                      </span>
                      <span className="tabular-nums">
                        {pixelArea === undefined
                          ? count.toLocaleString()
                          : ((count * pixelArea) / 1e6).toFixed(3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[
                  [copy.minimum, summary.minimum],
                  [copy.maximum, summary.maximum],
                  [copy.mean, summary.mean],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                    <p className="mt-1 tabular-nums">
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
}
