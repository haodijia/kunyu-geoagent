import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, X } from "lucide-react";
import { useState } from "react";
import { useAppUiStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";
import { analysisApi, type MapLayer, type MapState } from "./api";
import { useAnalysis } from "./useAnalysis";
import { AnalysisJobCard } from "./AnalysisJobCard";
import { OutputCard } from "./OutputCard";

import { AvailableOutput, LayerRow } from "./MapLayerRows";

const content = zhCN.analysis;
const tabs = ["jobs", "layers", "details"] as const;
export function AnalysisPanel({
  sessionId,
  workspaceId,
  state,
  layers,
  error,
}: {
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly state: MapState;
  readonly layers: readonly MapLayer[];
  readonly error: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<(typeof tabs)[number]>("layers");
  const services = useQuery({
    queryKey: ["analysis-services"],
    queryFn: analysisApi.services,
  });
  const mode = services.data?.find((service) => service.id === "ndvi")?.mode;
  const analysis = useAnalysis(sessionId);
  const outputs = analysis.outputs.data;
  const selected = outputs?.find(
    (output) => output.id === state.selected_output_id,
  );
  const client = useQueryClient();
  const failed =
    error ||
    services.isError ||
    analysis.jobs.isError ||
    analysis.outputs.isError;
  return (
    <aside
      className="absolute top-4 left-4 z-10 flex max-h-[calc(100%-var(--map-overlay-height,180px)-2rem)] w-80 max-w-[calc(100%-8rem)] flex-col rounded-xl border border-border bg-background/95 shadow-sm backdrop-blur"
      aria-label={content.title}
    >
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Layers className="size-4" />
          {content.title}
        </button>
        {mode !== undefined && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {content[mode]}
          </span>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={open ? content.close : content.open}
          onClick={() => setOpen((value) => !value)}
        >
          <X className={`size-3.5 ${open ? "" : "rotate-45"}`} />
        </Button>
      </div>
      {open && (
        <>
          <div
            className="flex shrink-0 gap-1 border-y border-border px-2 py-1"
            aria-label={content.title}
          >
            {tabs.map((item) => (
              <Button
                key={item}
                className="flex-1"
                size="sm"
                variant={tab === item ? "secondary" : "ghost"}
                aria-pressed={tab === item}
                onClick={() => setTab(item)}
              >
                {content[item]}
              </Button>
            ))}
          </div>
          <div className="min-h-0 space-y-3 overflow-auto p-3">
            {failed && (
              <div role="alert" className="text-xs text-destructive">
                {content.loadFailed}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void client.invalidateQueries({
                      queryKey: ["analysis", sessionId],
                    })
                  }
                >
                  {content.refresh}
                </Button>
              </div>
            )}
            {tab === "jobs" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    useAppUiStore
                      .getState()
                      .setComposerDraft(sessionId, content.defaultPrompt)
                  }
                >
                  {content.start}
                </Button>
                {mode !== undefined && (
                  <p className="text-[11px] text-muted-foreground">
                    {content.modeHint[mode]}
                  </p>
                )}
                {analysis.jobs.isPending ? (
                  <p className="text-xs text-muted-foreground">
                    {content.loading}
                  </p>
                ) : analysis.jobs.data?.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {content.emptyJobs}
                  </p>
                ) : (
                  analysis.jobs.data?.map((job) => (
                    <AnalysisJobCard
                      key={job.id}
                      jobId={job.id}
                      sessionId={sessionId}
                    />
                  ))
                )}
              </>
            )}
            {tab === "layers" && (
              <>
                {layers.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {content.emptyLayers}
                  </p>
                )}
                {[...layers].reverse().map((layer) => (
                  <LayerRow
                    key={layer.id}
                    layer={layer}
                    count={layers.length}
                    selected={layer.output_id === state.selected_output_id}
                    onSelect={() => setTab("details")}
                  />
                ))}
                {outputs
                  ?.filter(
                    (output) =>
                      !layers.some((layer) => layer.output_id === output.id),
                  )
                  .map((output) => (
                    <AvailableOutput key={output.id} output={output} />
                  ))}
              </>
            )}
            {tab === "details" &&
              (selected === undefined ? (
                <p className="text-xs text-muted-foreground">
                  {content.emptyDetails}
                </p>
              ) : (
                <>
                  <OutputCard
                    output={selected}
                    workspaceId={workspaceId}
                    compact
                  />
                  <dl className="space-y-2 break-all text-[11px] text-muted-foreground">
                    <div>
                      <dt>{content.provenance}</dt>
                      <dd>{content[selected.mode]}</dd>
                    </div>
                    <div>
                      <dt>{content.displaySize}</dt>
                      <dd>
                        {String(selected.metadata.width)} ×{" "}
                        {String(selected.metadata.height)}
                      </dd>
                    </div>
                    <div>
                      <dt>{content.spatialReference}</dt>
                      <dd>{String(selected.metadata.crs)}</dd>
                    </div>
                    <div>
                      <dt>{content.coverage} · WGS84</dt>
                      <dd>
                        {selected.bounds
                          .map((value) => value.toFixed(5))
                          .join(", ")}
                      </dd>
                    </div>
                    <div>
                      <dt>{content.outputReference}</dt>
                      <dd className="font-mono">{selected.id}</dd>
                    </div>
                  </dl>
                </>
              ))}
          </div>
        </>
      )}
    </aside>
  );
}
