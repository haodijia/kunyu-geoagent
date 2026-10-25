import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, CheckCircle2, CircleAlert } from "lucide-react";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { toolLabel } from "@/features/agent/tools/tool-presentation";
import { toolJob } from "@/features/jobs/job-state";
import { sessionAnalysisPath } from "@/features/sessions/routes";
import { workspaceOverviewPath } from "@/features/workspaces/routes";
import { productCopy as copy } from "@/locales/zh-CN/product";
import { zhCN } from "@/locales/zh-CN";

export function TaskStatus() {
  const { agentTurnsQuery } = useSessionMessages();
  const session = useSessionWorkspace();
  const { records } = useSessionEvents();
  const turns = agentTurnsQuery.data ?? [];
  const turn =
    turns.find(
      (item) => !["completed", "failed", "cancelled"].includes(item.state),
    ) ?? turns.at(-1);
  const active =
    turn !== undefined &&
    !turn.requires_resume &&
    ["ready", "model_running", "tool_running"].includes(turn.state);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, [active, turn?.id]);
  if (turn === undefined) return null;
  const jobs = turns
    .flatMap((item) => item.tool_calls)
    .map((tool) => toolJob(tool.id, records))
    .filter((job) => job !== undefined);
  const runningJob = jobs.find((job) =>
    ["running", "stopping"].includes(job.status),
  );
  const currentTool = turn.tool_calls.find((tool) => tool.status === "running");
  const failed =
    turn.state === "failed" ||
    turn.state === "interrupted" ||
    turn.requires_resume;
  const waiting = ["waiting_input", "waiting_confirmation"].includes(
    turn.state,
  );
  const Icon = failed
    ? CircleAlert
    : active || runningJob || waiting
      ? Activity
      : CheckCircle2;
  const minutes = Math.max(
    0,
    Math.floor(
      ((active ? now : Date.parse(turn.updated_at)) -
        Date.parse(turn.created_at)) /
        60000,
    ),
  );
  return (
    <div className="shrink-0 px-3" data-composer-zone>
      <details className="chat-surface-fluid rounded-xl border border-border/70 bg-background/95 px-3 py-2 text-xs">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-secondary-foreground">
          <Icon
            className={`size-3.5 shrink-0 ${failed ? "text-warning" : "text-primary"}`}
          />
          <span role="status" className="min-w-0 flex-1 truncate">
            {runningJob
              ? `${runningJob.label} · ${zhCN.conversation.tools.jobStages[runningJob.stage]}`
              : currentTool
                ? `${copy.status[turn.state]} · ${toolLabel(currentTool.name)}`
                : turn.requires_resume
                  ? copy.status.interrupted
                  : copy.status[turn.state]}
          </span>
          {active && (
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {copy.elapsed} {minutes < 1 ? "< 1" : minutes} min
            </span>
          )}
        </summary>
        <div className="space-y-2 pt-3 leading-5 text-muted-foreground">
          <p>
            {active || runningJob
              ? copy.continueBackground
              : turn.requires_resume || turn.state === "interrupted"
                ? copy.interrupted
                : waiting
                  ? copy.paused
                  : copy.retained}
          </p>
          {(active || runningJob) && <p>{copy.stopHint}</p>}
          {turn.pause_reason && (
            <p className="break-words">{turn.pause_reason}</p>
          )}
          {runningJob?.detail && (
            <p className="break-words">{runningJob.detail}</p>
          )}
          <div className="flex gap-4 text-primary">
            <Link
              to={sessionAnalysisPath(
                session.workspace_id,
                session.id,
                "trace",
              )}
            >
              {copy.inspect}
            </Link>
            <Link
              to={workspaceOverviewPath(session.workspace_id)}
              state={{ sessionId: session.id }}
            >
              {copy.results}
            </Link>
          </div>
        </div>
      </details>
    </div>
  );
}
