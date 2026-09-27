/**
 * Adapted from mu / AionUi. Copyright 2025 AionUi (aionui.com).
 * SPDX-License-Identifier: Apache-2.0
 * Kunyu adaptations: data access, localization, and Tailwind utility syntax.
 */
import { Dropdown, Menu, Message } from "@arco-design/web-react";
import { DeleteOne, FolderClose, MoreOne } from "@icon-park/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AionModal } from "@/components/ui/AionModal";
import {
  setSessionArchived,
  sessionQueryKeys,
  type SessionSummary
} from "@/features/sessions/api";
import { removeWorkspace, workspaceQueryKeys, type Workspace } from "./api";
import { clearLastSessionRoute, readLastSessionRoute } from "@/app/storage";
import { parseSessionRoute } from "@/features/sessions/routes";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.workspaceSidebar;

export function WorkspaceActions({
  workspace,
  sessions
}: {
  readonly workspace: Workspace;
  readonly sessions: readonly SessionSummary[];
}) {
  const [action, setAction] = useState<"archive" | "remove" | null>(null);
  const removing = action === "remove";
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const handleCancel = () => {
    if (!pending) setAction(null);
  };
  const handleConfirm = async () => {
    setPending(true);
    try {
      if (removing) {
        await removeWorkspace(workspace.id);
        const stored = readLastSessionRoute();
        if (
          stored !== null &&
          parseSessionRoute(stored)?.workspaceId === workspace.id
        )
          clearLastSessionRoute();
        if (parseSessionRoute(location.pathname)?.workspaceId === workspace.id)
          await navigate("/", { replace: true });
        setAction(null);
        await queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.all
        });
        Message.success(content.removeSuccess);
        return;
      }
      const results = await Promise.allSettled(
        sessions.map(async (session) => {
          const updated = await setSessionArchived(session.id, true);
          queryClient.setQueryData(
            sessionQueryKeys.detail(session.id),
            updated
          );
          return updated;
        })
      );
      const successCount = results.filter(
        (result) => result.status === "fulfilled"
      ).length;
      for (const result of results)
        if (result.status === "rejected")
          console.error("[workspaces] Archive failed", result.reason);
      const stored = readLastSessionRoute();
      if (
        stored !== null &&
        parseSessionRoute(stored)?.workspaceId === workspace.id
      )
        clearLastSessionRoute();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: sessionQueryKeys.archived })
      ]);
      if (successCount > 0) Message.success(content.archiveCount(successCount));
      if (successCount < sessions.length) Message.error(content.archiveFailed);
      setAction(null);
    } catch (error) {
      console.error("[workspaces] Action failed", error);
      Message.error(removing ? content.removeFailed : content.archiveFailed);
    } finally {
      setPending(false);
    }
  };
  const projectMenu = (
    <Menu
      onClickMenuItem={() => {
        setAction(sessions.length === 0 ? "remove" : "archive");
      }}
    >
      <Menu.Item
        key={sessions.length === 0 ? "remove" : "archive"}
        disabled={pending}
      >
        <span className="flex items-center gap-[8px]">
          {sessions.length === 0 ? (
              <DeleteOne theme="outline" size="14" />
            ) : (
              <FolderClose theme="outline" size="14" />
            )}
          {sessions.length === 0
            ? content.removeWorkspace
            : content.archiveWorkspace}
        </span>
      </Menu.Item>
    </Menu>
  );
  return (
    <>
      <Dropdown
        droplist={projectMenu}
        trigger="click"
        position="br"
        getPopupContainer={() => document.body}
        unmountOnExit={false}
      >
        <button
          type="button"
          aria-label={content.workspaceActions}
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
      <AionModal
        visible={action !== null}
        style={{ width: "400px" }}
        header={{
          title: removing
            ? content.removeWorkspaceTitle
            : content.archiveWorkspaceTitle,
          showClose: true,
          style: { borderBottom: "none" }
        }}
        onCancel={handleCancel}
        footer={
          <div className="flex justify-end gap-[12px] pt-[16px]">
            <button
              type="button"
              className="px-[24px] py-[8px] rounded-[20px] text-[14px] font-medium transition-all"
              style={{
                border: "1px solid var(--color-border-2)",
                backgroundColor: "var(--color-fill-2)",
                color: "var(--color-text-1)",
                cursor: pending ? "not-allowed" : "pointer",
                opacity: pending ? 0.55 : 1
              }}
              onMouseEnter={(event) => {
                if (!pending)
                  event.currentTarget.style.backgroundColor =
                    "var(--color-fill-3)";
              }}
              onMouseLeave={(event) => {
                if (!pending)
                  event.currentTarget.style.backgroundColor =
                    "var(--color-fill-2)";
              }}
              onClick={handleCancel}
              disabled={pending}
            >
              {content.cancel}
            </button>
            <button
              type="button"
              className="px-[24px] py-[8px] rounded-[20px] text-[14px] font-medium transition-all"
              style={{
                border: "1px solid rgb(var(--primary-6))",
                backgroundColor: "transparent",
                color: "rgb(var(--primary-6))",
                cursor: pending ? "not-allowed" : "pointer",
                opacity: pending ? 0.55 : 1
              }}
              onMouseEnter={(event) => {
                if (!pending) {
                  event.currentTarget.style.backgroundColor =
                    "rgba(var(--primary-6), 0.08)";
                }
              }}
              onMouseLeave={(event) => {
                if (!pending)
                  event.currentTarget.style.backgroundColor = "transparent";
              }}
              onClick={() => void handleConfirm()}
              disabled={pending}
            >
              {pending
                ? removing
                  ? content.removing
                  : content.processing
                : removing
                  ? content.removeWorkspace
                  : content.archiveWorkspace}
            </button>
          </div>
        }
      >
        <div className="text-[14px] leading-[22px] text-t-secondary">
          {removing
            ? content.removeWorkspaceDescription(workspace.name)
            : content.archiveWorkspaceDescription(
                workspace.name,
                sessions.length
              )}
        </div>
      </AionModal>
    </>
  );
}
