import { ApiError } from "@/api/client";
import { clearLastSessionRoute, readLastSessionRoute } from "@/app/storage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { parseSessionRoute } from "@/features/sessions/routes";
import {
  removeWorkspace,
  workspaceQueryKeys,
  type Workspace,
} from "@/features/workspaces/api";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ellipsis, Pencil, Upload, X } from "lucide-react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

const content = zhCN.workspaceSidebar;

export function WorkspaceActions({
  workspace,
  disabled,
  onRename,
  onUpload,
}: {
  readonly workspace: Workspace;
  readonly disabled: boolean;
  readonly onRename: () => void;
  readonly onUpload: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const removal = useMutation({
    mutationFn: () => removeWorkspace(workspace.id),
    onSuccess: async () => {
      const stored = readLastSessionRoute();
      if (
        stored !== null &&
        parseSessionRoute(stored)?.workspaceId === workspace.id
      )
        clearLastSessionRoute();
      if (matchPath("/workspaces/:workspaceId/*", location.pathname)?.params.workspaceId === workspace.id)
        await navigate("/", { replace: true });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["sessions"] })
      ]);
      toast.success(content.removeSuccess);
    },
    onError: (error) => {
      console.error("[workspaces] Removal failed", error);
      toast.error(
        error instanceof ApiError && error.code === "RUN_CONFLICT"
          ? content.removeRunConflict
          : content.removeFailed
      );
    }
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={content.workspaceActions}
          disabled={disabled || removal.isPending}
          className="sider-action-btn hidden size-[20px] cursor-pointer items-center justify-center rounded-[4px] border-0 p-0 text-t-secondary transition-colors group-hover:flex group-focus-within:flex hover:text-t-primary data-[state=open]:flex"
          onClick={(event) => event.stopPropagation()}
        >
          <Ellipsis size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" alignOffset={-8}>
        <DropdownMenuItem onSelect={onUpload}>
          <Upload strokeWidth={1.75} aria-hidden="true" />
          {zhCN.workspaceFiles.title}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRename}>
          <Pencil strokeWidth={1.75} aria-hidden="true" />
          {content.renameWorkspace}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={removal.isPending}
          onSelect={() => removal.mutate()}
        >
          <X strokeWidth={1.75} aria-hidden="true" />
          {content.removeWorkspace}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
