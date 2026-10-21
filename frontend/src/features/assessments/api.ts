import { requestBlob, requestJson } from "@/api/client";
import type { MultiPolygon, Polygon } from "geojson";

export type StudyGeometry = Polygon | MultiPolygon;
export interface StudyArea {
  readonly workspace_id: string;
  readonly name: string;
  readonly geometry: StudyGeometry;
  readonly revision: number;
  readonly area_m2: number;
  readonly updated_at: string;
}
export interface AssessmentRequest {
  readonly operation_id: string;
  readonly title: string;
  readonly area_revision: number;
  readonly before_output_id: string;
  readonly after_output_id: string;
  readonly before_scl_output_id: string;
  readonly after_scl_output_id: string;
  readonly before_date: string;
  readonly after_date: string;
  readonly threshold: number;
  readonly calibration: string;
  readonly method_status: "exploratory" | "calibrated";
  readonly min_patch_area_m2: number;
  readonly event_context: string;
}
export interface Assessment {
  readonly id: string;
  readonly workspace_id: string;
  readonly status: "building" | "succeeded" | "failed";
  readonly request: AssessmentRequest;
  readonly area: StudyArea;
  readonly output_id: string | null;
  readonly result_directory: string;
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly artifacts: readonly {
    readonly filename: string;
    readonly media_type: string;
    readonly label: string;
  }[];
  readonly error: string | null;
  readonly created_at: string;
}
export interface RasterSample {
  readonly inside: boolean;
  readonly values: readonly (number | null)[];
  readonly bands: readonly (string | null)[];
  readonly row?: number;
  readonly column?: number;
  readonly categories: readonly Category[] | null;
}
export interface Category {
  readonly value: number;
  readonly label: string;
  readonly color: string;
}
export interface RegionStatistics {
  readonly selected_pixel_count: number;
  readonly valid_pixel_count: number;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly mean: number | null;
  readonly region_area_m2: number;
  readonly classes: readonly (Category & { readonly area_m2: number })[];
  readonly coverage_note: string;
}
const root = (workspace: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspace)}`;
export const assessmentKeys = {
  area: (workspace: string) => ["study-area", workspace] as const,
  list: (workspace: string) => ["assessments", workspace] as const,
  detail: (workspace: string, id: string) =>
    ["assessment", workspace, id] as const,
};
export const assessmentApi = {
  area: (workspace: string) =>
    requestJson<StudyArea | null>(`${root(workspace)}/study-area`),
  saveArea: (
    workspace: string,
    body: { name: string; geometry: StudyGeometry; expected_revision: number },
  ) =>
    requestJson<StudyArea>(`${root(workspace)}/study-area`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  list: (workspace: string) =>
    requestJson<Assessment[]>(`${root(workspace)}/assessments`),
  get: (workspace: string, id: string) =>
    requestJson<Assessment>(
      `${root(workspace)}/assessments/${encodeURIComponent(id)}`,
    ),
  create: (workspace: string, body: AssessmentRequest) =>
    requestJson<Assessment>(`${root(workspace)}/assessments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  sample: (
    workspace: string,
    output: string,
    longitude: number,
    latitude: number,
    signal: AbortSignal,
  ) =>
    requestJson<RasterSample>(
      `${root(workspace)}/results/${encodeURIComponent(output)}/sample?longitude=${longitude}&latitude=${latitude}`,
      { signal },
    ),
  statistics: (workspace: string, output: string, geometry: StudyGeometry) =>
    requestJson<RegionStatistics>(
      `${root(workspace)}/results/${encodeURIComponent(output)}/statistics`,
      { method: "POST", body: JSON.stringify({ geometry }) },
    ),
  features: (workspace: string, id: string) =>
    requestJson<GeoJSON.FeatureCollection>(
      `${root(workspace)}/assessments/${encodeURIComponent(id)}/files/added-water.geojson`,
    ),
  download: async (workspace: string, id: string, filename: string) => {
    const blob = await requestBlob(
      `${root(workspace)}/assessments/${encodeURIComponent(id)}/files/${encodeURIComponent(filename)}`,
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export function rasterCategories(
  metadata: Readonly<Record<string, unknown>>,
): readonly Category[] {
  if (!Array.isArray(metadata.categories)) return [];
  return metadata.categories.filter(
    (entry: unknown): entry is Category =>
      typeof entry === "object" &&
      entry !== null &&
      "value" in entry &&
      typeof entry.value === "number" &&
      "label" in entry &&
      typeof entry.label === "string" &&
      "color" in entry &&
      typeof entry.color === "string",
  );
}
