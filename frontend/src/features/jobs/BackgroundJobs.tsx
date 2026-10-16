import { useQuery } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { requestJson } from "@/api/client";
import { zhCN } from "@/locales/zh-CN";

interface BackgroundJob {
  readonly id: string;
  readonly label: string;
  readonly status: "running" | "stopping" | "completed" | "failed" | "killed";
  readonly detail: string | null;
}

export function BackgroundJobs({ sessionId }: { readonly sessionId: string }) {
  const jobs = useQuery({
    queryKey: ["background-jobs", sessionId],
    queryFn: () =>
      requestJson<BackgroundJob[]>(
        `/api/v1/sessions/${encodeURIComponent(sessionId)}/jobs`,
      ),
    refetchInterval: 2000,
  });
  const active =
    jobs.data?.filter((job) =>
      ["running", "stopping", "failed"].includes(job.status),
    ) ?? [];
  if (jobs.isError)
    return (
      <p role="alert" className="px-3 py-1 text-xs text-destructive">
        {zhCN.mapConversation.jobsFailed}
      </p>
    );
  if (active.length === 0) return null;
  return (
    <div
      className="mx-auto mb-2 max-h-28 w-[calc(100%-3rem)] max-w-[880px] space-y-1 overflow-y-auto rounded-xl border border-border/60 bg-background/90 px-3 py-2 text-xs backdrop-blur-xl"
      aria-live="polite"
    >
      {active.map((job) => (
        <details key={job.id}>
          <summary className="flex cursor-pointer list-none items-center gap-2">
            <span aria-hidden="true">
              {job.status === "failed" ? (
                <CircleAlert className="size-3.5 text-destructive" />
              ) : (
                <LoaderCircle className="size-3.5 animate-spin text-primary motion-reduce:animate-none" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">{job.label}</span>
            <span className="text-muted-foreground">
              {zhCN.mapConversation.jobStatus[job.status]}
            </span>
          </summary>
          {job.detail !== null && (
            <p className="pt-2 text-muted-foreground">{job.detail}</p>
          )}
        </details>
      ))}
    </div>
  );
}
