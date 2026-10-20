import type { TrajectoryEventProjection } from "@/features/events/projection/events";
import { zhCN } from "@/locales/zh-CN";

export interface BackgroundJob {
  readonly id: string;
  readonly owner_run_id: string;
  readonly tool_call_id: string;
  readonly kind: string;
  readonly label: string;
  readonly status: "running" | "stopping" | "completed" | "failed" | "killed";
  readonly detail: string | null;
  readonly stage: keyof typeof zhCN.conversation.tools.jobStages;
  readonly error: { readonly code: string; readonly message: string; readonly truncated: boolean } | null;
  readonly log_file_path: string;
  readonly started_at: number;
  readonly finished_at: number | null;
}

export function jobError(job: BackgroundJob | undefined): string | null {
  if (job === undefined || job.error === null) return null;
  return `${zhCN.conversation.tools.jobStages[job.stage]} · ${job.error.code}: ${job.error.message}`;
}

export function toolJob(toolId: string, records: readonly TrajectoryEventProjection[]): BackgroundJob | undefined {
  const event = records.findLast(record => record.eventType === "job/changed" && record.entityId === toolId);
  if (event === undefined) return undefined;
  return event.payload as unknown as BackgroundJob;
}

export function jobById(jobId: string, records: readonly TrajectoryEventProjection[]): BackgroundJob | undefined {
  const event = records.findLast(record => record.eventType === "job/changed" && record.payload.id === jobId);
  return event === undefined ? undefined : event.payload as unknown as BackgroundJob;
}
