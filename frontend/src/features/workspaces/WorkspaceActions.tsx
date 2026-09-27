import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearLastSessionRoute, readLastSessionRoute } from "@/app/storage";
import { ActionMenu } from "@/components/ui/action-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { parseSessionRoute } from "@/features/sessions/routes";
import { removeWorkspace, type Workspace, workspaceQueryKeys } from "./api";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.workspaceSidebar;

export function WorkspaceActions({
  workspace
}: {
  readonly workspace: Workspace;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const preview = useQuery({
    queryKey: ["workspace-removal", workspace.id],
    queryFn: () => removeWorkspace(workspace.id, true),
    enabled: open,
    staleTime: 0
  });
  const removal = useMutation({
    mutationFn: () => removeWorkspace(workspace.id),
    onSuccess: async () => {
      const stored = readLastSessionRoute();
      if (
        stored !== null &&
        parseSessionRoute(stored)?.workspaceId === workspace.id
      )
        clearLastSessionRoute();
      if (parseSessionRoute(location.pathname)?.workspaceId === workspace.id)
        await navigate("/", { replace: true });
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["sessions"] })
      ]);
    },
    onError: (error) => console.error("[workspaces] Removal failed", error)
  });
  return (
    <>
      <ActionMenu
        label={`${content.moreActions}${workspace.name}`}
        action={content.removeWorkspace}
        icon={<Trash2 className="size-4" />}
        destructive
        onSelect={() => {
          removal.reset();
          setOpen(true);
        }}
      />
      <ConfirmDialog
        open={open}
        title={content.removeWorkspace}
        description={
          preview.data
            ? content.removeDescription(
                workspace.name,
                preview.data.session_count
              )
            : content.loadingRemoval
        }
        confirmLabel={content.removeWorkspace}
        pending={removal.isPending}
        ready={preview.isSuccess && !preview.isFetching}
        error={removal.error?.message ?? preview.error?.message ?? null}
        onCancel={() => setOpen(false)}
        onConfirm={() => removal.mutate()}
      />
    </>
  );
}
