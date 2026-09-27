/**
 * Adapted from mu's workspace menu. Copyright 2025 AionUi (aionui.com).
 * SPDX-License-Identifier: Apache-2.0
 */
import { Dropdown, Menu, Message } from "@arco-design/web-react";
import { DeleteOne, MoreOne } from "@icon-park/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { clearLastSessionRoute, readLastSessionRoute } from "@/app/storage";
import { parseSessionRoute } from "@/features/sessions/routes";
import { zhCN } from "@/locales/zh-CN";
import { removeWorkspace, workspaceQueryKeys, type Workspace } from "./api";

const content = zhCN.workspaceSidebar;

export function WorkspaceActions({
  workspace
}: {
  readonly workspace: Workspace;
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
      if (parseSessionRoute(location.pathname)?.workspaceId === workspace.id)
        await navigate("/", { replace: true });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["sessions"] })
      ]);
      Message.success(content.removeSuccess);
    },
    onError: (error) => {
      console.error("[workspaces] Removal failed", error);
      Message.error(content.removeFailed);
    }
  });
  return (
    <Dropdown
      droplist={
        <Menu onClickMenuItem={() => removal.mutate()}>
          <Menu.Item key="remove" disabled={removal.isPending}>
            <span className="flex items-center gap-[8px]">
              <DeleteOne theme="outline" size="14" />
              {content.removeWorkspace}
            </span>
          </Menu.Item>
        </Menu>
      }
      trigger="click"
      position="br"
      getPopupContainer={() => document.body}
      unmountOnExit={false}
    >
      <button
        type="button"
        aria-label={content.workspaceActions}
        disabled={removal.isPending}
        className="sider-action-btn hidden size-[20px] cursor-pointer items-center justify-center rounded-[4px] border-0 p-0 text-t-secondary transition-colors group-hover:flex group-focus-within:flex hover:text-t-primary"
        onClick={(event) => event.stopPropagation()}
      >
        <MoreOne
          theme="outline"
          size="14"
          fill="currentColor"
          className="block leading-none"
        />
      </button>
    </Dropdown>
  );
}
