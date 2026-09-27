/**
 * Adapted from mu / AionUi. Copyright 2025 AionUi (aionui.com).
 * SPDX-License-Identifier: Apache-2.0
 * Kunyu adaptations: data access, localization, and Tailwind utility syntax.
 */
import { Dropdown, Menu, Message } from "@arco-design/web-react";
import { FolderClose, MoreOne } from "@icon-park/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AionModal } from "@/components/ui/AionModal";
import {
  setSessionArchived,
  sessionQueryKeys,
  type SessionSummary
} from "@/features/sessions/api";
import { workspaceQueryKeys, type Workspace } from "./api";
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
  const [open, setOpen] = useState(false);
  const [archiveProjectLoading, setArchiveProjectLoading] = useState(false);
  const queryClient = useQueryClient();
  const handleArchiveProjectCancel = () => {
    if (!archiveProjectLoading) setOpen(false);
  };
  const handleArchiveProjectConfirm = async () => {
    setArchiveProjectLoading(true);
    try {
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
      setOpen(false);
    } catch (error) {
      console.error("[workspaces] Archive failed", error);
      Message.error(content.archiveFailed);
    } finally {
      setArchiveProjectLoading(false);
    }
  };
  const projectMenu = (
    <Menu
      onClickMenuItem={() => {
        if (sessions.length > 0) setOpen(true);
      }}
    >
      <Menu.Item key="archive" disabled={sessions.length === 0}>
        <span className="flex items-center gap-[8px]">
          <FolderClose theme="outline" size="14" />
          {content.archiveWorkspace}
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
        visible={open}
        style={{ width: "400px" }}
        header={{
          title: content.archiveWorkspaceTitle,
          showClose: true,
          style: { borderBottom: "none" }
        }}
        onCancel={handleArchiveProjectCancel}
        footer={
          <div className="flex justify-end gap-[12px] pt-[16px]">
            <button
              type="button"
              className="px-[24px] py-[8px] rounded-[20px] text-[14px] font-medium transition-all"
              style={{
                border: "1px solid var(--color-border-2)",
                backgroundColor: "var(--color-fill-2)",
                color: "var(--color-text-1)",
                cursor: archiveProjectLoading ? "not-allowed" : "pointer",
                opacity: archiveProjectLoading ? 0.55 : 1
              }}
              onMouseEnter={(event) => {
                if (!archiveProjectLoading)
                  event.currentTarget.style.backgroundColor =
                    "var(--color-fill-3)";
              }}
              onMouseLeave={(event) => {
                if (!archiveProjectLoading)
                  event.currentTarget.style.backgroundColor =
                    "var(--color-fill-2)";
              }}
              onClick={handleArchiveProjectCancel}
              disabled={archiveProjectLoading}
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
                cursor: archiveProjectLoading ? "not-allowed" : "pointer",
                opacity: archiveProjectLoading ? 0.55 : 1
              }}
              onMouseEnter={(event) => {
                if (!archiveProjectLoading) {
                  event.currentTarget.style.backgroundColor =
                    "rgba(var(--primary-6), 0.08)";
                }
              }}
              onMouseLeave={(event) => {
                if (!archiveProjectLoading)
                  event.currentTarget.style.backgroundColor = "transparent";
              }}
              onClick={() => void handleArchiveProjectConfirm()}
              disabled={archiveProjectLoading}
            >
              {archiveProjectLoading
                ? content.processing
                : content.archiveWorkspace}
            </button>
          </div>
        }
      >
        <div className="text-[14px] leading-[22px] text-t-secondary">
          {content.archiveWorkspaceDescription(workspace.name, sessions.length)}
        </div>
      </AionModal>
    </>
  );
}
