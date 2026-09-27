import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clearLastSessionRoute, readLastSessionRoute } from "@/app/storage";
import { ActionMenu } from "@/components/ui/action-menu";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import { workspaceQueryKeys } from "@/features/workspaces/api";
import {
  setSessionArchived,
  sessionQueryKeys,
  type SessionSummary
} from "./api";
import { parseSessionRoute, sessionOverviewPath } from "./routes";

export function SessionRow({
  session,
  selected
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
      if (selected) await navigate("/", { replace: true });
      queryClient.setQueryData(sessionQueryKeys.detail(session.id), updated);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.sessions(session.workspace_id)
        }),
        queryClient.invalidateQueries({ queryKey: sessionQueryKeys.archived })
      ]);
    },
    onError: (error) => console.error("[sessions] Archive failed", error)
  });
  return (
    <div>
      <div
        className={cn(
          "group flex h-8 min-w-0 items-center rounded-md pr-2 pl-8 text-sm",
          selected
            ? "bg-slate-200 text-slate-950"
            : "text-slate-600 hover:bg-slate-100"
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-current={selected ? "page" : undefined}
          onClick={() =>
            void navigate(sessionOverviewPath(session.workspace_id, session.id))
          }
        >
          <MessageCircle className="size-3.5 shrink-0" />
          <span className="truncate">{session.title}</span>
        </button>
        <ActionMenu
          label={`${zhCN.workspaceSidebar.moreActions}${session.title}`}
          action={zhCN.workspaceSidebar.archiveSession}
          icon={<Archive className="size-4" />}
          disabled={archive.isPending}
          onSelect={() => archive.mutate()}
        />
      </div>
      {archive.error && (
        <p role="alert" className="px-8 text-xs text-red-600">
          {archive.error.message}
        </p>
      )}
    </div>
  );
}
