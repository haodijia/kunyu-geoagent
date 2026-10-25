import { useAppUiStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import {
  analysisApi,
  analysisKeys,
  type AnalysisOutput,
} from "@/features/analysis/api";
import { colorRamps, type RasterView } from "./raster-views";
import { rasterCopy } from "@/locales/zh-CN/raster-views";
import { referenceOutput } from "@/features/analysis/result-reference";
import { useOutputImage } from "@/features/analysis/useOutputImage";
import { ImageLightbox } from "@/features/attachments/ImageLightbox";
import { sessionMapPath } from "@/features/sessions/routes";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, LocateFixed, MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { RasterBandSummary } from "@/features/analysis/RasterBandSummary";

const content = zhCN.analysis;
export function RasterOutputCard({
  output,
  view,
  workspaceId,
  sessionId,
  compact = false,
}: {
  readonly output: AnalysisOutput;
  readonly view: RasterView;
  readonly workspaceId: string;
  readonly sessionId: string | null;
  readonly compact?: boolean;
}) {
  const image = useOutputImage(
    output.workspace_id,
    output.id,
    view.id,
    output.revision,
  );
  const client = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categories = view.style.type === "classified" ? view.style.classes : [];
  const description =
    view.style.type !== "rgb"
      ? content.scalarDescription
      : content.rgbDescription;
  const mutation = useMutation({
    mutationFn: async (action: "map" | "download" | "preview") => {
      if (action === "map") {
        if (sessionId === null)
          throw new Error("An active session is required.");
        const layer = await analysisApi.addLayer(sessionId, output.id, view.id);
        const ui = useAppUiStore.getState();
        ui.initializeMapContext(sessionId, workspaceId);
        ui.inspectMapLayer(sessionId, layer.id);
        ui.setMapComparison(sessionId, null);
        ui.focusMap(sessionId, output.bounds);
        await client.invalidateQueries({
          queryKey: analysisKeys.layers(sessionId),
        });
        void navigate(sessionMapPath(workspaceId, sessionId));
      } else {
        const blob =
          action === "download"
            ? await analysisApi.download(output.workspace_id, output.id)
            : await analysisApi.preview(
                output.workspace_id,
                output.id,
                view.id,
              );
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${output.title}.${action === "preview" ? "png" : "tif"}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    },
    onMutate: () => setError(null),
    onError: (reason) => {
      console.error("[analysis] Result action failed", {
        outputId: output.id,
        reason,
      });
      setError(reason.message);
    },
  });
  function imageFailed() {
    console.error("[analysis] Preview decoding failed", {
      outputId: output.id,
    });
    setDecodeFailed(true);
    setOpen(false);
  }
  return (
    <section
      className="min-w-0 space-y-2 py-2"
      data-analysis-output={output.id}
    >
      <p className="text-sm font-medium">{view.title}</p>
      {image.url !== null && !decodeFailed ? (
        <button
          type="button"
          className="block w-full rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen(true)}
          aria-label={zhCN.conversation.attachments.preview(view.title)}
        >
          <img
            className={`w-full rounded-md object-contain ${compact ? "max-h-64" : "max-h-96"}`}
            src={image.url}
            alt={view.title}
            onError={imageFailed}
          />
        </button>
      ) : (
        <p
          className="rounded bg-muted px-3 py-5 text-xs text-muted-foreground"
          role="status"
        >
          {image.error || decodeFailed
            ? content.previewFailed
            : content.loading}
        </p>
      )}
      {categories.length > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {categories.map((entry) => (
            <span key={entry.value} className="flex items-center gap-1">
              <span
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              {entry.label}
            </span>
          ))}
        </div>
      ) : (
        view.style.type === "continuous" &&
        Array.isArray(view.render_ranges[0]) && (
          <div
            className="text-[10px] text-muted-foreground"
            aria-label={content.displayRange}
          >
            <div
              className="h-1.5 rounded-full"
              style={{ background: colorRamps[view.style.color_ramp] }}
            />
            <div className="mt-1 flex justify-between">
              {view.render_ranges[0].map((value, index) => (
                <span key={index}>{Number(value).toPrecision(4)}</span>
              ))}
            </div>
          </div>
        )
      )}
      {view.description.length > 0 && (
        <p className="text-xs leading-5 text-muted-foreground">
          {view.description}
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">
        {rasterCopy.bands}:{" "}
        {view.bands
          .map((index) => output.metadata.bands[index - 1]!.title)
          .join(" / ")}
      </p>
      <RasterBandSummary output={output} view={view} />
      <div className="flex flex-wrap gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={mutation.isPending || sessionId === null}
          onClick={() => mutation.mutate("map")}
        >
          <LocateFixed className="size-3.5" />
          {content.viewMap}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("download")}
        >
          <Download className="size-3.5" />
          {rasterCopy.source}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={sessionId === null}
          onClick={() => {
            if (sessionId !== null) referenceOutput(sessionId, output, view.id);
          }}
        >
          <MessageSquarePlus className="size-3.5" />
          {content.continueQuestion}
        </Button>
      </div>
      <details
        className="text-xs text-muted-foreground"
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer py-1">
          {content.resultDetails}
        </summary>
        {detailsOpen && (
          <div className="space-y-2 pt-2">
            <p className="leading-5">{description}</p>
            <p>
              {String(output.metadata.width)} × {String(output.metadata.height)}{" "}
              · {String(output.metadata.crs)} · {output.metadata.band_count}{" "}
              {content.bands}
            </p>
            <p>{output.file_path}</p>
            <Button
              variant="ghost"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("preview")}
            >
              {content.downloadPreview}
            </Button>
            <details
              onToggle={(event) => setSourceOpen(event.currentTarget.open)}
            >
              <summary className="cursor-pointer">{content.provenance}</summary>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
                {sourceOpen
                  ? JSON.stringify(output.source_metadata, null, 2)
                  : ""}
              </pre>
            </details>
          </div>
        )}
      </details>
      {error !== null && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {open && image.url !== null && (
        <ImageLightbox
          src={image.url}
          name={view.title}
          description={description}
          onClose={() => setOpen(false)}
          onError={imageFailed}
        />
      )}
    </section>
  );
}
