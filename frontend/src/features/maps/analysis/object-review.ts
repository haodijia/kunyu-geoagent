import { requestJson } from "@/api/client";
import {
  workspaceResultsPath,
  type AnalysisOutput,
} from "@/features/analysis/api";
import type { Feature, FeatureCollection, Geometry } from "geojson";

interface VectorSource {
  readonly id: string;
  readonly name: string;
  readonly attribution: string;
  readonly license: string;
  readonly license_url: string;
  readonly snapshot_at: string;
}

export interface ReviewVectorProperties {
  readonly name: string | null;
  readonly kind: "point" | "line" | "area";
  readonly dataset_id: string;
  readonly feature_index: number;
}

export type ReviewVector = Feature<Geometry, ReviewVectorProperties> & {
  readonly id: string;
};

export type ObjectVectors = Omit<
  FeatureCollection<Geometry, ReviewVectorProperties>,
  "features"
> & {
  readonly features: ReviewVector[];
  readonly datasets: readonly VectorSource[];
  readonly coverage: "full" | "partial" | "none";
};

export interface ObjectMeasurement {
  readonly extent: number;
  readonly covered: number;
  readonly candidate: number;
  readonly evidence: number | null;
  readonly missing: number;
  readonly ambiguous: number;
}

export type ObjectReview =
  | { readonly status: "measured"; readonly measurement: ObjectMeasurement }
  | { readonly status: "outside" | "excluded"; readonly measurement: null };

function resultPath(output: AnalysisOutput) {
  return `${workspaceResultsPath(output.workspace_id)}/${encodeURIComponent(output.id)}`;
}

export function fetchObjectVectors(
  output: AnalysisOutput,
  signal: AbortSignal,
) {
  return requestJson<ObjectVectors>(`${resultPath(output)}/object-vectors`, {
    signal,
  });
}

export function inspectVector(
  output: AnalysisOutput,
  { dataset_id, feature_index }: ReviewVectorProperties,
  signal: AbortSignal,
) {
  return requestJson<ObjectReview>(`${resultPath(output)}/object-review`, {
    method: "POST",
    body: JSON.stringify({ dataset_id, feature_index }),
    signal,
  });
}
