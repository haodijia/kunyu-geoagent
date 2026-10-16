import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, LocateFixed, MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppUiStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import { sessionAnalysisPath, sessionMapPath } from "@/features/sessions/routes";
import { zhCN } from "@/locales/zh-CN";
import { analysisApi, analysisKeys, type AnalysisOutput } from "./api";
import { useOutputImage } from "./useOutputImage";

const content = zhCN.analysis;

export function OutputCard({
  output,
  workspaceId,
  sessionId,
  compact = false,
}: {
  readonly output: AnalysisOutput;
  readonly workspaceId: string;
  readonly compact?: boolean;
  readonly sessionId: string | null;
}) {
  const image = useOutputImage(output.workspace_id, output.id);
  const client = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (action: "map" | "download" | "preview") => {
      if (action === "map") {
        if (sessionId === null) throw new Error("Choose an active session before opening a result on the map.");
        const layer = await analysisApi.addLayer(sessionId, output.id);
        if (!layer.visible)
          await analysisApi.style(sessionId, layer, {
            visible: true,
            opacity: layer.opacity,
            position: layer.position,
          });
        const state = await analysisApi.focus(sessionId, output.id);
        client.setQueryData(analysisKeys.map(sessionId), state);
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
        link.download =
          action === "download" ? "analysis-result.tif" : "analysis-preview.png";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    },
    onError: (reason) => {
      console.error("[analysis] Result action failed.", {
        outputId: output.id,
        reason,
      });
      setError(content.actionFailed);
    },
    onMutate: () => setError(null),
  });
  function addToConversation() {
    if (sessionId === null) throw new Error("Choose an active session before referencing a result.");
    const store = useAppUiStore.getState();
    const previous = store.composerDraftBySession[sessionId];
    const reference = content.resultPrompt(output.id);
    store.setComposerDraft(
      sessionId,
      previous === undefined || previous.trim() === ""
        ? reference
        : `${previous}\n\n${reference}`,
    );
    void navigate(sessionAnalysisPath(workspaceId, sessionId, "conversation"));
  }
  return (
    <section
      className="space-y-2 py-2"
      data-analysis-output={output.id}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{output.title}</span>
      </div>
      {image.url !== null ? (
        <img
          className={`w-full rounded-md bg-muted object-contain ${compact ? "max-h-64" : "max-h-96"}`}
          src={image.url}
          alt={content.previewAlt}
        />
      ) : (
        <div
          className="rounded bg-muted px-3 py-5 text-xs text-muted-foreground"
          role="status"
        >
          {image.error ? content.previewFailed : content.loading}
        </div>
      )}
      <p className="my-2 text-xs leading-5 text-muted-foreground">
        {output.kind === "scalar_raster"
          ? content.scalarDescription
          : content.rgbDescription}
      </p>
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
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("preview")}
        >
          {content.downloadPreview}
        </Button>
        <Button variant="ghost" size="sm" disabled={sessionId === null} onClick={addToConversation}>
          <MessageSquarePlus className="size-3.5" />
          {content.addToConversation}
        </Button>
      </div>
      {output.kind === "scalar_raster" &&
        Array.isArray(output.metadata.display_range) && (
          <div
            className="my-2 text-[10px] text-muted-foreground"
            aria-label={content.displayRange}
          >
            <div className="h-1.5 rounded-full bg-[linear-gradient(to_right,#440154,#3b528b,#21918c,#5ec962,#fde725)]" />
            <div className="mt-1 flex justify-between">
              {output.metadata.display_range.map((value, index) => (
                <span key={index}>{Number(value).toPrecision(4)}</span>
              ))}
            </div>
          </div>
        )}
      {error !== null ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
