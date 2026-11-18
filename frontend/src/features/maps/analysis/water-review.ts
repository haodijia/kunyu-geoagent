import { requestJson } from "@/api/client";
import { workspaceResultsPath } from "@/features/analysis/api";
import type { MapBounds } from "@/features/sessions/map-context";
import type {
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from "geojson";

export interface WaterReviewItem {
  readonly name: string;
  readonly kind: "park" | "road";
  readonly source: string;
  readonly attribution: string | null;
  readonly bounds: MapBounds;
  readonly geometry: Polygon | MultiPolygon | LineString | MultiLineString;
  readonly extent: number;
  readonly covered: number;
  readonly candidate: number;
  readonly stable: number;
  readonly missing: number;
  readonly disagreement: number;
}

export interface WaterReview {
  readonly output_id: string;
  readonly datasets: readonly string[];
  readonly items: readonly WaterReviewItem[];
}

export function getWaterReview(
  workspace: string,
  output: string,
  query: string,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({ query });
  return requestJson<WaterReview>(
    `${workspaceResultsPath(workspace)}/${encodeURIComponent(output)}/water-review?${params}`,
    { signal },
  );
}
