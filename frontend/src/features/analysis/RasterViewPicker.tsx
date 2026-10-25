import type { RasterView } from "./raster-views";
import { rasterCopy as copy } from "@/locales/zh-CN/raster-views";

export function RasterViewPicker({
  views,
  selected,
  onSelect,
}: {
  readonly views: readonly RasterView[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
}) {
  const current = views.find((view) => view.id === selected)!;
  const groups = [...new Set(views.map((view) => view.group))];
  if (views.length === 1) return null;
  return (
    <>
      <div
        className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1"
        role="group"
        aria-label={copy.groups}
      >
        {groups.map((group) => (
          <button
            type="button"
            key={group}
            aria-pressed={group === current.group}
            className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${group === current.group ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() =>
              onSelect(views.find((view) => view.group === group)!.id)
            }
          >
            {group}
          </button>
        ))}
      </div>
      <div
        className="flex flex-wrap gap-1"
        role="group"
        aria-label={copy.select}
      >
        {views
          .filter((view) => view.group === current.group)
          .map((view) => (
            <button
              type="button"
              key={view.id}
              aria-pressed={view.id === selected}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${view.id === selected ? "border-primary/30 bg-primary/8 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted"}`}
              onClick={() => onSelect(view.id)}
            >
              {view.title}
            </button>
          ))}
      </div>
    </>
  );
}
