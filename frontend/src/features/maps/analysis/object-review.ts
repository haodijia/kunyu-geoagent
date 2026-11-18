import { requestJson } from "@/api/client";
import {
  workspaceResultsPath,
  type ObjectReviewProfile,
} from "@/features/analysis/api";
import type {
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from "geojson";

export interface ReviewDataset {
  readonly name: string;
  readonly file_path: string;
}

export interface ObjectReviewItem {
  readonly name: string;
  readonly kind: "area" | "line";
  readonly geometry: Polygon | MultiPolygon | LineString | MultiLineString;
  readonly bounds: readonly [number, number, number, number];
  readonly extent: number;
  readonly covered: number;
  readonly candidate: number;
  readonly evidence: number | null;
  readonly missing: number;
  readonly ambiguous: number;
}

interface ObjectReview {
  readonly dataset: ReviewDataset;
  readonly attribution: string | null;
  readonly profile: ObjectReviewProfile;
  readonly items: readonly ObjectReviewItem[];
}

function reviewPath(workspace: string, output: string) {
  return `${workspaceResultsPath(workspace)}/${encodeURIComponent(output)}/object-review`;
}

export function listReviewDatasets(
  workspace: string,
  output: string,
  signal: AbortSignal,
) {
  return requestJson<ReviewDataset[]>(
    `${reviewPath(workspace, output)}/datasets`,
    { signal },
  );
}

export function reviewObjects(
  workspace: string,
  output: string,
  input: { readonly file_path: string; readonly query: string },
  signal: AbortSignal,
) {
  return requestJson<ObjectReview>(reviewPath(workspace, output), {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });
}
