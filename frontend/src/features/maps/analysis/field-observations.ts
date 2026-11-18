import { requestJson } from "@/api/client";
import { validAttachment, type Attachment } from "@/features/attachments/api";
import type { TrajectoryEventProjection } from "@/features/events/projection/events";
import type { MapObjectReference } from "@/features/sessions/map-context";

export interface FieldObservation {
  readonly id: string;
  readonly reference: MapObjectReference;
  readonly observed_at: string;
  readonly note: string;
  readonly photos: readonly Attachment[];
}

export interface FieldObservationInput {
  readonly id: string;
  readonly reference: MapObjectReference;
  readonly observed_at: string;
  readonly note: string;
  readonly photo_ids: readonly string[];
}

export function saveFieldObservation(
  sessionId: string,
  input: FieldObservationInput,
) {
  return requestJson<FieldObservation>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/field-observations`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function fieldObservationsFor(
  records: readonly TrajectoryEventProjection[],
  reference: MapObjectReference,
): FieldObservation[] {
  return records
    .flatMap(({ eventType, payload }) => {
      if (
        eventType !== "context.injected" ||
        payload.producer !== "field-observation"
      )
        return [];
      const data = payload.metadata as Partial<FieldObservation> | undefined;
      if (
        !data?.reference ||
        data.reference.output_id !== reference.output_id ||
        data.reference.dataset_id !== reference.dataset_id ||
        data.reference.feature_index !== reference.feature_index ||
        typeof data.id !== "string" ||
        typeof data.note !== "string" ||
        typeof data.observed_at !== "string" ||
        !Array.isArray(data.photos) ||
        !data.photos.every(validAttachment)
      )
        return [];
      return [data as FieldObservation];
    })
    .reverse();
}
