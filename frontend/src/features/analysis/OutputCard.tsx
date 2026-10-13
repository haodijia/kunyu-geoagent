import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, LocateFixed, MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppUiStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import { sessionMapPath } from "@/features/sessions/routes";
import { zhCN } from "@/locales/zh-CN";
import { analysisApi, analysisKeys, type AnalysisOutput } from "./api";
import { useOutputImage } from "./useOutputImage";

const content = zhCN.analysis;

export function OutputCard({
  output,
  workspaceId,
  compact = false,
}: {
  readonly output: AnalysisOutput;
  readonly workspaceId: string;
  readonly compact?: boolean;
}) {
  const image = useOutputImage(output.session_id, output.id);
  const client = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (action: "map" | "download" | "preview") => {
      if (action === "map") {
        const layer = await analysisApi.addLayer(output.session_id, output.id);
        if (!layer.visible)
          await analysisApi.style(output.session_id, layer, {
            visible: true,
            opacity: layer.opacity,
            position: layer.position,
          });
        const state = await analysisApi.focus(output.session_id, output.id);
        client.setQueryData(analysisKeys.map(output.session_id), state);
        await client.invalidateQueries({
          queryKey: analysisKeys.layers(output.session_id),
        });
        void navigate(sessionMapPath(workspaceId, output.session_id));
      } else {
        const blob =
          action === "download"
            ? await analysisApi.download(output.session_id, output.id)
            : await analysisApi.preview(output.session_id, output.id);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download =
          action === "download" ? "ndvi-display.tif" : "ndvi-preview.png";
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
    const store = useAppUiStore.getState();
    const previous = store.composerDraftBySession[output.session_id];
    const reference = content.resultPrompt(output.id, output.mode === "replay");
    store.setComposerDraft(
      output.session_id,
      previous === undefined || previous.trim() === ""
        ? reference
        : `${previous}\n\n${reference}`,
    );
  }
  return (
    <section
      className="rounded-lg border border-border bg-background p-3"
      data-analysis-output={output.id}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{output.title}</span>
        <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          {output.mode === "replay" ? content.replay : content.live}
        </span>
      </div>
      {image.url !== null ? (
        <img
          className={`w-full rounded-md bg-muted object-contain ${compact ? "max-h-32" : "max-h-56"}`}
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
        {content.rgbDescription}
      </p>
      <div className="flex flex-wrap gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={mutation.isPending}
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
        <Button variant="ghost" size="sm" onClick={addToConversation}>
          <MessageSquarePlus className="size-3.5" />
          {content.addToConversation}
        </Button>
      </div>
      <p className="mt-2 mb-0 text-[10px] text-muted-foreground">
        {content.originalUnavailable}
      </p>
      {error !== null ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
