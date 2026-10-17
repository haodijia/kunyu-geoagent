import { Button } from "@/components/ui/button";
import type { MapState } from "@/features/analysis/api";
import type { ImageCandidates } from "@/features/maps/imagery/imagery-api";
import { zhCN } from "@/locales/zh-CN";
import { Check, Image, LocateFixed } from "lucide-react";

const content = zhCN.mapConversation;

export function ImageryPanel({
  state,
  candidates,
  error,
  preview,
  onPreview,
  disabled,
  selectionError,
  retry,
  onLocate,
}: {
  readonly state: MapState;
  readonly candidates: ImageCandidates | undefined;
  readonly error: boolean;
  readonly preview: number | null;
  readonly onPreview: (id: number) => void;
  readonly disabled: boolean;
  readonly selectionError: string | null;
  readonly retry: () => void;
  readonly onLocate: () => void;
}) {
  return (
    <aside
      className="absolute top-4 left-4 z-10 flex max-h-[calc(100%-var(--map-overlay-height,180px)-2rem)] w-80 max-w-[calc(100%-6rem)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-background/95 shadow-sm backdrop-blur-xl"
      aria-label={content.candidates}
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 text-sm font-medium">
        <Image className="size-4 text-muted-foreground" />
        {content.candidates}
        <span className="ml-auto text-xs text-muted-foreground">
          {candidates?.images.length}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={content.locate}
          onClick={onLocate}
        >
          <LocateFixed className="size-3.5" />
        </Button>
      </div>
      {selectionError !== null && (
        <p role="alert" className="px-4 py-2 text-xs text-destructive">
          {selectionError}
        </p>
      )}
      <div className="min-h-0 overflow-auto p-2">
        {error ? (
          <div role="alert" className="p-3 text-xs text-destructive">
            {content.candidatesFailed}
            <Button size="sm" variant="ghost" onClick={retry}>
              {content.retry}
            </Button>
          </div>
        ) : candidates === undefined ? (
          <p className="p-3 text-xs text-muted-foreground">{content.loading}</p>
        ) : candidates.images.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {content.emptyCandidates}
          </p>
        ) : (
          candidates.images.map((item, index) => (
            <button
              key={item.imageId}
              type="button"
              disabled={disabled}
              aria-pressed={preview === item.imageId}
              className={`flex w-full gap-3 rounded-xl border px-3 py-3 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${preview === item.imageId ? "border-border bg-muted/70" : "border-transparent hover:bg-muted/70"}`}
              onClick={() => onPreview(item.imageId)}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium">
                {state.selected_image_id === item.imageId ? (
                  <Check className="size-3.5" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {item.productName}
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {item.phenomenonTime}
                </span>
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  {item.resolution === null
                    ? content.unknownResolution
                    : item.resolution}
                  {item.coverCloud === null
                    ? ""
                    : ` · ${content.cloud(item.coverCloud)}`}
                  {item.footprint === null ? ` · ${content.noFootprint}` : ""}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
