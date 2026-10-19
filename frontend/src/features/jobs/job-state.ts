import type { TrajectoryEventProjection } from "@/features/events/projection/events";

export interface BackgroundJob {
  readonly id: string;
  readonly owner_run_id: string;
  readonly tool_call_id: string;
  readonly kind: string;
  readonly label: string;
  readonly status: "running" | "stopping" | "completed" | "failed" | "killed";
  readonly detail: string | null;
  readonly started_at: number;
  readonly finished_at: number | null;
}

export function toolJob(toolId: string, records: readonly TrajectoryEventProjection[]): BackgroundJob | undefined {
  const event = records.findLast(record => record.eventType === "job/changed" && record.entityId === toolId);
  if (event === undefined) return undefined;
  return event.payload as unknown as BackgroundJob;
}
