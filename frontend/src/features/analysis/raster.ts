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
  readonly units: readonly (string | null)[];
  readonly row?: number;
  readonly column?: number;
  readonly categories: readonly Category[] | null;
}
export interface BandRegionStatistics {
  readonly band: number;
  readonly title: string;
  readonly unit: string | null;
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
export interface RegionStatistics {
  readonly output_id: string;
  readonly view_id: string;
  readonly bands: readonly BandRegionStatistics[];
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
    viewId: string,
  ) =>
    requestJson<RasterSample>(
      `${root(workspace, output)}/sample?longitude=${longitude}&latitude=${latitude}&view_id=${encodeURIComponent(viewId)}`,
      { signal },
    ),
  statistics: (
    workspace: string,
    output: string,
    geometry: RegionGeometry,
    viewId: string,
    signal?: AbortSignal,
  ) =>
    requestJson<RegionStatistics>(`${root(workspace, output)}/statistics`, {
      method: "POST",
      body: JSON.stringify({ geometry, view_id: viewId }),
      signal,
    }),
};
