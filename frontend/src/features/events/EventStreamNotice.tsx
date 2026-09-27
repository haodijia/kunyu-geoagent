import { LoaderCircle, TriangleAlert } from "lucide-react";

import type { EventStreamStatus } from "@/features/events/SessionEventContext";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.trajectory;

interface EventStreamNoticeProps {
  readonly error: string | null;
  readonly status: EventStreamStatus;
}

export function EventStreamNotice({
  error,
  status
}: EventStreamNoticeProps) {
  if (status === "connected") {
    return null;
  }

  const failed = status === "failed";
  const Icon = failed ? TriangleAlert : LoaderCircle;
  const label =
    status === "connecting"
      ? content.connecting
      : failed
        ? content.failed
        : content.reconnecting;

  return (
    <div
      className={
        failed
          ? "flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
          : "flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning"
      }
      role={failed ? "alert" : "status"}
      title={error ?? undefined}
    >
      <Icon
        className={failed ? "size-3.5" : "size-3.5 animate-spin"}
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}
