import { useAppUiStore } from "@/app/store";
import type { AnalysisOutput, MapLayer } from "@/features/analysis/api";
import { referenceText } from "@/features/workspaces/references";

export function appendReference(
  sessionId: string,
  name: string,
  target: string,
) {
  const store = useAppUiStore.getState();
  const previous = store.composerDraftBySession[sessionId] ?? "";
  const reference = referenceText(name, target);
  store.setComposerDraft(
    sessionId,
    previous.trim() === "" ? `${reference} ` : `${previous}\n${reference} `,
  );
}
export function referenceOutput(sessionId: string, output: AnalysisOutput) {
  appendReference(
    sessionId,
    output.title,
    output.file_path.split("/").map(encodeURIComponent).join("/"),
  );
}
export function referenceLayer(
  sessionId: string,
  layer: MapLayer,
  outputs: readonly AnalysisOutput[],
) {
  if (layer.image !== null)
    appendReference(
      sessionId,
      layer.title,
      `oge-image:${layer.image.image_id}`,
    );
  else {
    const output = outputs.find((item) => item.id === layer.output_id);
    if (output === undefined)
      throw new Error("Selected result is unavailable.");
    referenceOutput(sessionId, output);
  }
}
