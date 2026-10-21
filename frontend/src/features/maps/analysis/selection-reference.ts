import { requestJson } from "@/api/client";
import type { Geometry } from "geojson";
import type { AnalysisOutput, MapLayer } from "@/features/analysis/api";
import { appendReference } from "@/features/analysis/result-reference";

export async function referenceSelection(
  workspaceId: string,
  sessionId: string,
  title: string,
  layer: MapLayer,
  geometry: Geometry,
  outputs: readonly AnalysisOutput[],
) {
  const output = outputs.find((value) => value.id === layer.output_id);
  if (layer.output_id !== null && output === undefined)
    throw new Error("Selected result is unavailable.");
  const feature = {
    type: "Feature",
    geometry,
    properties: {
      source_title: layer.title,
      output_id: layer.output_id,
      file_path: output?.file_path ?? null,
      image_id: layer.image?.image_id ?? null,
      layer_id: layer.id,
    },
  };
  const name = `${title}-${new Date().toISOString().replaceAll(":", "-")}.geojson`;
  const params = new URLSearchParams({ name, kind: "file" });
  const saved = await requestJson<{ file_path: string }>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/files?${params}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Blob([JSON.stringify(feature)], {
        type: "application/octet-stream",
      }),
    },
  );
  appendReference(
    sessionId,
    `${title} · ${layer.title}`,
    saved.file_path.split("/").map(encodeURIComponent).join("/"),
  );
}
