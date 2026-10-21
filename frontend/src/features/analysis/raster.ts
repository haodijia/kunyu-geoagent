import { requestJson } from "@/api/client";
import type { MultiPolygon, Polygon } from "geojson";

export type RegionGeometry = Polygon | MultiPolygon;
export interface Category {
  readonly value: number;
  readonly label: string;
  readonly color: string;
}
export interface RasterSample {
  readonly inside: boolean;
  readonly values: readonly (number | null)[];
  readonly bands: readonly (string | null)[];
  readonly row?: number;
  readonly column?: number;
  readonly categories: readonly Category[] | null;
}
export interface RegionStatistics {
  readonly selected_pixel_count: number;
  readonly valid_pixel_count: number;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly mean: number | null;
  readonly region_area_m2: number;
  readonly classes: readonly (Category & { readonly area_m2: number })[];
  readonly value_areas: readonly {
    readonly value: number;
    readonly pixel_count: number;
    readonly area_m2: number;
  }[];
  readonly coverage_note: string;
}
const root = (workspace: string, output: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspace)}/results/${encodeURIComponent(output)}`;
export const rasterApi = {
  sample: (
    workspace: string,
    output: string,
    longitude: number,
    latitude: number,
    signal: AbortSignal,
  ) =>
    requestJson<RasterSample>(
      `${root(workspace, output)}/sample?longitude=${longitude}&latitude=${latitude}`,
      { signal },
    ),
  statistics: (workspace: string, output: string, geometry: RegionGeometry) =>
    requestJson<RegionStatistics>(`${root(workspace, output)}/statistics`, {
      method: "POST",
      body: JSON.stringify({ geometry }),
    }),
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
