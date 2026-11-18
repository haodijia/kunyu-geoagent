import type { ObjectReviewProfile } from "@/features/analysis/api";
import type { TrajectoryEventProjection } from "@/features/events/projection/events";
import type { MapBounds } from "@/features/sessions/map-context";

interface ReviewDataset {
  readonly id: string;
  readonly name: string;
  readonly attribution: string;
  readonly license: string;
  readonly license_url: string;
  readonly snapshot_at: string;
}

export interface ObjectReviewItem {
  readonly name: string;
  readonly kind: "area" | "line";
  readonly bounds: MapBounds;
  readonly extent: number;
  readonly covered: number;
  readonly candidate: number;
  readonly evidence: number | null;
  readonly missing: number;
  readonly ambiguous: number;
}

export interface ObjectReview {
  readonly output_id: string;
  readonly output_title: string;
  readonly datasets: readonly ReviewDataset[];
  readonly coverage: "full" | "partial";
  readonly profile: ObjectReviewProfile;
  readonly items: readonly ObjectReviewItem[];
}

export function latestObjectReview(
  records: readonly TrajectoryEventProjection[],
  displayedOutputs: ReadonlySet<string>,
): { id: string; report: ObjectReview } | null {
  if (displayedOutputs.size === 0) return null;
  const requests = new Set<string>();
  let latest = null;
  for (const record of records) {
    if (
      record.eventType === "tool.requested" &&
      record.payload.name === "result_review_objects"
    ) {
      requests.add(record.entityId);
    }
    if (record.eventType !== "tool.completed" || !requests.has(record.entityId))
      continue;
    const result = record.payload.result;
    if (
      typeof result === "object" &&
      result !== null &&
      "output_id" in result &&
      typeof result.output_id === "string" &&
      displayedOutputs.has(result.output_id) &&
      "output_title" in result &&
      typeof result.output_title === "string" &&
      "datasets" in result &&
      Array.isArray(result.datasets) &&
      "items" in result &&
      Array.isArray(result.items) &&
      "coverage" in result &&
      (result.coverage === "full" || result.coverage === "partial")
    ) {
      latest = { id: record.id, report: result as unknown as ObjectReview };
    }
  }
  return latest;
}
