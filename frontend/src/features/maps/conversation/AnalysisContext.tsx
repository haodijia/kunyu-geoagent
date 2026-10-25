import { useQuery } from "@tanstack/react-query";
import { MapPin, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAppUiStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import { analysisApi, analysisKeys } from "@/features/analysis/api";
import { referenceLayer } from "@/features/analysis/result-reference";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { productCopy as copy } from "@/locales/zh-CN/product";
import { useState } from "react";

export function AnalysisContext() {
  const session = useSessionWorkspace();
  const location = useLocation();
  const selection = useAppUiStore(
    (state) => state.mapContextBySession[session.id]?.selection,
  );
  const mapView = location.pathname.endsWith("/map");
  const layers = useQuery({
    queryKey: analysisKeys.layers(session.id),
    queryFn: () => analysisApi.layers(session.id),
    enabled: selection != null,
  });
  const outputs = useQuery({
    queryKey: analysisKeys.outputs(session.workspace_id),
    queryFn: () => analysisApi.outputs(session.workspace_id),
    enabled: selection != null,
  });
  const layer = layers.data?.find((item) => item.id === selection?.layer_id);
  const [error, setError] = useState<string | null>(null);
  if (selection == null && !mapView) return null;
  function prompt(text: string) {
    try {
      if (layer !== undefined)
        referenceLayer(session.id, layer, outputs.data ?? []);
      const store = useAppUiStore.getState();
      const previous = store.composerDraftBySession[session.id] ?? "";
      store.setComposerDraft(
        session.id,
        previous.trim() ? `${previous}\n${text}` : text,
      );
      setError(null);
    } catch (reason) {
      console.error("[map] Could not prepare selected-region prompt", reason);
      setError(reason instanceof Error ? reason.message : copy.noLayer);
    }
  }
  return (
    <div className="shrink-0 px-3" data-composer-zone>
      <details className="chat-surface-fluid mb-2 rounded-xl border border-border/70 bg-background/95 px-3 py-2 text-xs">
        <summary className="flex cursor-pointer list-none items-center gap-2">
          <MapPin className="size-3.5 shrink-0 text-primary" />
          <span className="font-medium">{copy.currentObject}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {selection == null
              ? copy.noSelection
              : selection.geometry.type === "Point"
                ? copy.selectedPoint
                : copy.selectedRegion}
          </span>
          {selection != null && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={copy.removeSelection}
              onClick={(event) => {
                event.preventDefault();
                useAppUiStore.getState().setMapSelection(session.id, null);
              }}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </summary>
        {selection != null && (
          <div className="mt-2 space-y-2">
            <p className="truncate" title={layer?.title}>
              {copy.selectedLayer}：{layer?.title ?? copy.noLayer}
            </p>
            <p className="text-muted-foreground">
              {copy.acquisition}：
              {layer?.image?.acquired_at ?? copy.dataDateUnknown}
            </p>
            <div className="flex flex-wrap gap-2">
              {[copy.inspectRegion, copy.explainRegion].map((title, index) => (
                <Button
                  key={title}
                  size="sm"
                  variant="outline"
                  disabled={
                    selection.layer_id !== null &&
                    (layer === undefined ||
                      outputs.isPending ||
                      outputs.isError)
                  }
                  onClick={() =>
                    prompt(index === 0 ? copy.regionPrompt : copy.explainPrompt)
                  }
                >
                  {title}
                </Button>
              ))}
            </div>
            {(error || layers.isError || outputs.isError) && (
              <p role="alert" className="text-destructive">
                {error ?? layers.error?.message ?? outputs.error?.message}
              </p>
            )}
          </div>
        )}
        <p className="mt-1 leading-5 text-muted-foreground">{copy.browsing}</p>
      </details>
    </div>
  );
}
