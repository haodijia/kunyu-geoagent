import { requestJson, requestBlob } from "@/api/client";
import type { MapState } from "@/features/analysis/api";

export interface ImageCandidate {
  readonly imageId: number;
  readonly imageIdentification: string;
  readonly productName: string;
  readonly phenomenonTime: string;
  readonly coverCloud: number | null;
  readonly resolution: string | null;
  readonly footprint: readonly (readonly [number, number])[] | null;
}
export interface ImageCandidates {
  readonly id: string;
  readonly session_id: string;
  readonly images: readonly ImageCandidate[];
}
export const imageryKey = (sessionId: string, id: string | null) =>
  ["imagery", sessionId, id] as const;
const sessionPath = (id: string) =>
  `/api/v1/sessions/${encodeURIComponent(id)}`;
export const imageryApi = {
  get: (sessionId: string, id: string) =>
    requestJson<ImageCandidates>(
      `${sessionPath(sessionId)}/imagery/${encodeURIComponent(id)}`,
    ),
  choose: (sessionId: string, candidateSetId: string, imageId: number | null) =>
    requestJson<MapState>(`${sessionPath(sessionId)}/map/selection`, {
      method: "PUT",
      body: JSON.stringify({
        candidate_set_id: candidateSetId,
        image_id: imageId,
      }),
    }),
  preview: (
    sessionId: string,
    id: string,
    imageId: number,
    signal: AbortSignal,
  ) =>
    requestBlob(
      `${sessionPath(sessionId)}/imagery/${encodeURIComponent(id)}/images/${imageId}/preview`,
      signal,
    ),
  receipt: (
    sessionId: string,
    requestId: string,
    status: "applied" | "failed",
    error: string | null,
  ) =>
    requestJson<MapState>(
      `${sessionPath(sessionId)}/map/presentations/${encodeURIComponent(requestId)}`,
      {
        method: "PUT",
        body: JSON.stringify({ status, error }),
      },
    ),
};
