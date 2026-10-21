import { useAppUiStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import {
  analysisApi,
  analysisKeys,
  type AnalysisOutput,
} from "@/features/analysis/api";
import { rasterCategories } from "@/features/analysis/raster";
import { referenceOutput } from "@/features/analysis/result-reference";
import { useOutputImage } from "@/features/analysis/useOutputImage";
import { ImageLightbox } from "@/features/attachments/ImageLightbox";
import { sessionMapPath } from "@/features/sessions/routes";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, LocateFixed, MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const content = zhCN.analysis;
export function OutputCard({
  output,
  workspaceId,
  sessionId,
  compact = false,
}: {
  readonly output: AnalysisOutput;
  readonly workspaceId: string;
  readonly sessionId: string | null;
  readonly compact?: boolean;
}) {
  const image = useOutputImage(output.workspace_id, output.id);
  const client = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categories = rasterCategories(output.metadata);
  const description =
    output.kind === "scalar_raster"
      ? content.scalarDescription
      : content.rgbDescription;
  const mutation = useMutation({
    mutationFn: async (action: "map" | "download" | "preview") => {
      if (action === "map") {
        if (sessionId === null)
          throw new Error("An active session is required.");
        await analysisApi.addLayer(sessionId, output.id);
        useAppUiStore.getState().focusMap(sessionId, output.bounds);
        await client.invalidateQueries({
          queryKey: analysisKeys.layers(sessionId),
        });
        void navigate(sessionMapPath(workspaceId, sessionId));
      } else {
        const blob =
          action === "download"
            ? await analysisApi.download(output.workspace_id, output.id)
            : await analysisApi.preview(output.workspace_id, output.id);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${output.title}.${action === "download" ? "tif" : "png"}`;
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
      <p className="text-sm font-medium">{output.title}</p>
      {image.url !== null && !decodeFailed ? (
        <button
          type="button"
          className="block w-full rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen(true)}
          aria-label={zhCN.conversation.attachments.preview(output.title)}
        >
          <img
            className={`w-full rounded-md object-contain ${compact ? "max-h-64" : "max-h-96"}`}
            src={image.url}
            alt={output.title}
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
        output.kind === "scalar_raster" &&
        Array.isArray(output.metadata.display_range) && (
          <div
            className="text-[10px] text-muted-foreground"
            aria-label={content.displayRange}
          >
            <div className="h-1.5 rounded-full bg-[linear-gradient(to_right,#440154,#3b528b,#21918c,#5ec962,#fde725)]" />
            <div className="mt-1 flex justify-between">
              {output.metadata.display_range.map((value, index) => (
                <span key={index}>{Number(value).toPrecision(4)}</span>
              ))}
            </div>
          </div>
        )
      )}
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
          {content.downloadCog}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={sessionId === null}
          onClick={() => {
            if (sessionId !== null) referenceOutput(sessionId, output);
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
              · {String(output.metadata.crs)} ·{" "}
              {output.metadata.bands as number} {content.bands}
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
          name={output.title}
          description={description}
          onClose={() => setOpen(false)}
          onError={imageFailed}
        />
      )}
    </section>
  );
}
