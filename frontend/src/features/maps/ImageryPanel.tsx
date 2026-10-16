import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Image, LocateFixed } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { analysisKeys, type MapState } from "@/features/analysis/api";
import { useSessionMessages } from "@/features/messages/SessionMessagesContext";
import { zhCN } from "@/locales/zh-CN";
import { imageryApi, type ImageCandidates } from "./imagery-api";

const content = zhCN.mapConversation;

export function ImageryPanel({
  state,
  candidates,
  error,
  preview,
  onPreview,
  retry,
  onLocate,
}: {
  readonly state: MapState;
  readonly candidates: ImageCandidates | undefined;
  readonly error: boolean;
  readonly preview: number | null;
  readonly onPreview: (id: number) => void;
  readonly retry: () => void;
  readonly onLocate: () => void;
}) {
  const client = useQueryClient();
  const { draft, changeDraft, requestFrozen } = useSessionMessages();
  const selection = useMutation({
    mutationFn: (id: number) => {
      if (candidates === undefined)
        throw new Error("Candidates are not loaded.");
      return imageryApi.choose(state.session_id, candidates.id, id);
    },
    onSuccess: (value) => {
      client.setQueryData<MapState>(
        analysisKeys.map(state.session_id),
        (current) =>
          current === undefined || current.revision < value.revision
            ? value
            : current,
      );
      if (draft.trim() === "") changeDraft(content.selectionPrompt);
    },
    onError: (error) => {
      console.error("[map] Image selection failed.", error);
      void client.invalidateQueries({
        queryKey: analysisKeys.map(state.session_id),
      });
    },
  });
  const image = candidates?.images.find((image) => image.imageId === preview);
  return (
    <aside
      className="absolute top-4 left-4 z-10 flex max-h-[calc(100%-var(--map-overlay-height,180px)-2rem)] w-80 max-w-[calc(100%-6rem)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-background/95 shadow-sm backdrop-blur-xl"
      aria-label={content.candidates}
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 text-sm font-medium">
        <Image className="size-4 text-primary" />
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
              aria-pressed={preview === item.imageId}
              className={`flex w-full gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${preview === item.imageId ? "border-primary/25 bg-primary/8" : "border-transparent hover:bg-muted/70"}`}
              onClick={() => onPreview(item.imageId)}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium">
                {state.selected_image_id === item.imageId ? (
                  <Check className="size-3.5 text-primary" />
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
      {image !== undefined && candidates !== undefined && (
        <div className="shrink-0 border-t border-border/60 p-3">
          <ImageryPreview
            sessionId={state.session_id}
            candidateSetId={candidates.id}
            imageId={image.imageId}
          />
          <p
            className="my-2 truncate text-[10px] text-muted-foreground"
            title={image.imageIdentification}
          >
            {image.imageIdentification}
          </p>
          <Button
            size="sm"
            className="w-full"
            disabled={
              selection.isPending ||
              requestFrozen ||
              state.selected_image_id === image.imageId
            }
            onClick={() => selection.mutate(image.imageId)}
          >
            {state.selected_image_id === image.imageId
              ? content.selected
              : content.useImage}
          </Button>
          {state.selected_image_id === image.imageId && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              {content.imageInputReady}
            </p>
          )}
          {selection.isError && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {selection.error.message}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

function ImageryPreview({
  sessionId,
  candidateSetId,
  imageId,
}: {
  readonly sessionId: string;
  readonly candidateSetId: string;
  readonly imageId: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | null = null;
    setUrl(null);
    setError(false);
    void imageryApi
      .preview(sessionId, candidateSetId, imageId, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setUrl(url);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("[map] Imagery preview failed.", error);
        setError(true);
      });
    return () => {
      controller.abort();
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [sessionId, candidateSetId, imageId]);
  if (error)
    return (
      <p className="text-xs text-destructive" role="alert">
        {content.previewFailed}
      </p>
    );
  if (url === null)
    return (
      <div
        className="h-28 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
        aria-label={content.loading}
      />
    );
  return (
    <img
      src={url}
      alt={content.preview}
      className="h-28 w-full rounded-lg bg-muted object-contain"
    />
  );
}
