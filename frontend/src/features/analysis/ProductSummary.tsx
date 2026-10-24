import { productSummary } from "@/features/analysis/product-metadata";
import { productCopy as copy } from "@/locales/zh-CN/analysis-products";

export function ProductSummary({
  metadata,
}: {
  readonly metadata: Readonly<Record<string, unknown>>;
}) {
  const summary = productSummary(metadata);
  if (summary === null) return null;
  const pixelArea = summary.grid_pixel_area_m2;
  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-xs">
      <div className="flex justify-between text-muted-foreground">
        <span>{copy.validPixels}</span>
        <span className="tabular-nums">
          {summary.valid_pixels.toLocaleString()}
        </span>
      </div>
      {summary.categories.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-right text-[10px] text-muted-foreground">
            {pixelArea === undefined ? copy.count : `${copy.gridArea} · km²`}
          </div>
          {summary.categories.map((category) => (
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
                  ? category.pixel_count.toLocaleString()
                  : ((category.pixel_count * pixelArea) / 1e6).toFixed(3)}
              </span>
            </div>
          ))}
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
                {typeof value === "number" ? Number(value.toPrecision(5)) : "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
