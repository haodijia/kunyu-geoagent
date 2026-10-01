import { toast } from "sonner";
import { Tooltip } from "@/components/ui/tooltip";
import { Archive } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@/api/client";
import { clearLastSessionRoute, readLastSessionRoute } from "@/app/storage";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import { workspaceQueryKeys } from "@/features/workspaces/api";
import {
  setSessionArchived,
  sessionQueryKeys,
  type SessionSummary,
} from "./api";
import { parseSessionRoute, sessionOverviewPath } from "./routes";

const content = zhCN.workspaceSidebar;

export function SessionRow({
  session,
  selected,
}: {
  readonly session: SessionSummary;
  readonly selected: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const archive = useMutation({
    mutationFn: () => setSessionArchived(session.id, true),
    onSuccess: async (updated) => {
      const stored = readLastSessionRoute();
      if (
        stored !== null &&
        parseSessionRoute(stored)?.sessionId === session.id
      )
        clearLastSessionRoute();
      queryClient.setQueryData(sessionQueryKeys.detail(session.id), updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: sessionQueryKeys.archived }),
      ]);
      toast.success(content.archiveSuccess);
    },
    onError: (error) => {
      console.error("[sessions] Archive failed", error);
      toast.error(
        error instanceof ApiError && error.code === "RUN_CONFLICT"
          ? content.archiveRunConflict
          : content.archiveFailed,
      );
    },
  });
  function openSession() {
    void navigate(sessionOverviewPath(session.workspace_id, session.id));
  }
  return (
    <Tooltip label={session.title} side="right">
      <div
        className={cn(
          "chat-history__item group relative flex h-[30px] min-w-0 shrink-0 cursor-pointer items-center justify-start gap-[8px] overflow-hidden rounded-[6px] ps-[32px] pe-[28px] transition-colors",
          selected ? "bg-fill-3" : "hover:bg-fill-3",
        )}
        role="button"
        tabIndex={0}
        aria-label={session.title}
        aria-current={selected ? "page" : undefined}
        onClick={openSession}
        onKeyDown={(event) => {
          if (
            event.target !== event.currentTarget ||
            (event.key !== "Enter" && event.key !== " ")
          )
            return;
          event.preventDefault();
          openSession();
        }}
      >
        <span className="min-w-0 flex-1 truncate text-[13px] text-t-primary">
          {session.title}
        </span>
        <Tooltip label={content.archiveSession} side="top">
          <button
            type="button"
            aria-label={content.archiveSession}
            aria-busy={archive.isPending}
            disabled={archive.isPending}
            className="absolute end-[8px] top-1/2 hidden size-[20px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent p-0 text-t-tertiary transition-colors group-hover:flex group-focus-within:flex hover:bg-fill-2 hover:text-t-primary focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-50"
            onClick={(event) => {
              event.stopPropagation();
              archive.mutate();
            }}
          >
            <Archive size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </Tooltip>
  );
}
