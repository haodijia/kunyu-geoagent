import { requestBlob, requestJson } from "@/api/client";

export interface AnalysisJob {
  readonly id: string;
  readonly session_id: string;
  readonly workspace_id: string;
  readonly run_id: string | null;
  readonly tool_call_id: string;
  readonly mode: "replay" | "live";
  readonly service: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly state:
    | "submitting"
    | "queued"
    | "running"
    | "collecting"
    | "succeeded"
    | "failed"
    | "submission_unknown";
  readonly query_state: "ready" | "auth_required" | "disconnected";
  readonly remote_id: string | null;
  readonly revision: number;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}
export interface AnalysisOutput {
  readonly workspace_id: string;
  readonly id: string;
  readonly job_id: string | null;
  readonly session_id: string | null;
  readonly source_session_title: string;
  readonly file_path: string;
  readonly preview_path: string;
  readonly title: string;
  readonly mode: "replay" | "live";
  readonly kind: "rgb_raster" | "scalar_raster";
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly source_metadata: Readonly<Record<string, unknown>>;
  readonly bounds: readonly [number, number, number, number];
  readonly original_status: number;
  readonly revision: number;
  readonly created_at: string;
}
export interface MapLayer {
  readonly id: string;
  readonly session_id: string;
  readonly output_id: string | null;
  readonly image: {
    readonly image_id: number;
    readonly product_name: string;
    readonly acquired_at: string;
    readonly resolution: string | null;
    readonly cloud: number | null;
    readonly footprint: readonly (readonly [number, number])[] | null;
  } | null;
  readonly bounds: readonly [number, number, number, number] | null;
  readonly title: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly position: number;
  readonly revision: number;
}
export interface LayerStyle {
  readonly visible: boolean;
  readonly opacity: number;
  readonly position: number;
}
export const analysisKeys = {
  jobs: (id: string) => ["analysis", id, "jobs"] as const,
  outputs: (id: string) => ["analysis", "workspaces", id, "outputs"] as const,
  layers: (id: string) => ["analysis", id, "layers"] as const,
};
export const analysisPath = (sessionId: string) =>
  `/api/v1/sessions/${encodeURIComponent(sessionId)}/analysis`;
export const workspaceResultsPath = (workspaceId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/results`;
const mapPath = (id: string) =>
  `/api/v1/sessions/${encodeURIComponent(id)}/map`;
export const analysisApi = {
  jobs: (id: string) => requestJson<AnalysisJob[]>(`${analysisPath(id)}/jobs`),
  outputs: (id: string) =>
    requestJson<AnalysisOutput[]>(workspaceResultsPath(id)),
  layers: (id: string) => requestJson<MapLayer[]>(`${mapPath(id)}/layers`),
  addLayer: (id: string, outputId: string) =>
    requestJson<MapLayer>(`${mapPath(id)}/layers`, {
      method: "POST",
      body: JSON.stringify({ output_id: outputId }),
    }),
  style: (id: string, layer: MapLayer, style: LayerStyle) =>
    requestJson<MapLayer>(
      `${mapPath(id)}/layers/${encodeURIComponent(layer.id)}`,
      {
        method: "PUT",
        body: JSON.stringify({ expected_revision: layer.revision, ...style }),
      },
    ),
  removeLayer: (id: string, layer: MapLayer) =>
    requestJson<void>(
      `${mapPath(id)}/layers/${encodeURIComponent(layer.id)}?expected_revision=${layer.revision}`,
      { method: "DELETE" },
    ),
  preview: (id: string, outputId: string) =>
    requestBlob(
      `${workspaceResultsPath(id)}/${encodeURIComponent(outputId)}/preview`,
    ),
  download: (id: string, outputId: string) =>
    requestBlob(
      `${workspaceResultsPath(id)}/${encodeURIComponent(outputId)}/download`,
    ),
  layerPreview: (sessionId: string, layerId: string, signal?: AbortSignal) =>
    requestBlob(`${mapPath(sessionId)}/layers/${encodeURIComponent(layerId)}/preview`, signal),
};
