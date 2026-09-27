/**
 * Adapted from mu's GroupedHistory/ConversationRow.tsx and useConversationActions.ts.
 * Copyright 2025 AionUi (aionui.com). SPDX-License-Identifier: Apache-2.0
 */
import { Dropdown, Menu, Message, Tooltip } from "@arco-design/web-react";
import { FolderClose, MoreOne } from "@icon-park/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearLastSessionRoute, readLastSessionRoute } from "@/app/storage";
import { useMenuKeyboard } from "@/hooks/useMenuKeyboard";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import { workspaceQueryKeys } from "@/features/workspaces/api";
import {
  setSessionArchived,
  sessionQueryKeys,
  type SessionSummary
} from "./api";
import { parseSessionRoute, sessionOverviewPath } from "./routes";

const content = zhCN.workspaceSidebar;

export function SessionRow({
  session,
  selected
}: {
  readonly session: SessionSummary;
  readonly selected: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuVisible, setMenuVisible] = useState(false);
  const menuKeyboard = useMenuKeyboard<HTMLButtonElement>(
    menuVisible,
    setMenuVisible
  );
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
        queryClient.invalidateQueries({ queryKey: sessionQueryKeys.archived })
      ]);
      Message.success(content.archiveSuccess);
    },
    onError: (error) => {
      console.error("[sessions] Archive failed", error);
      Message.error(content.archiveFailed);
    }
  });
  function openSession() {
    setMenuVisible(false);
    void navigate(sessionOverviewPath(session.workspace_id, session.id));
  }
  return (
    <Tooltip content={session.title} position="right">
      <div
        className={cn(
          "chat-history__item group relative flex h-[34px] min-w-0 shrink-0 cursor-pointer items-center justify-start gap-[8px] overflow-hidden rounded-[8px] ps-[40px] pe-[16px] transition-colors",
          selected ? "bg-fill-3" : "hover:bg-fill-3"
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
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenuVisible(true);
        }}
      >
        <span className="min-w-0 flex-1 truncate text-[14px] text-t-primary">
          {session.title}
        </span>
        <div
          className={cn(
            "absolute end-[8px] top-1/2 -translate-y-1/2 items-center justify-end",
            menuVisible
              ? "flex"
              : "hidden group-hover:flex group-focus-within:flex"
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <Dropdown
            droplist={
              <Menu
                ref={menuKeyboard.menuRef}
                onKeyDown={menuKeyboard.onMenuKeyDown}
                onClickMenuItem={() => {
                  setMenuVisible(false);
                  archive.mutate();
                }}
              >
                <Menu.Item key="archive" disabled={archive.isPending}>
                  <div className="flex items-center gap-[8px]">
                    <FolderClose theme="outline" size="14" />
                    <span>{content.archiveSession}</span>
                  </div>
                </Menu.Item>
              </Menu>
            }
            trigger="click"
            position="br"
            popupVisible={menuVisible}
            onVisibleChange={setMenuVisible}
            getPopupContainer={() => document.body}
            unmountOnExit={false}
          >
            <button
              ref={menuKeyboard.buttonRef}
              onKeyDown={menuKeyboard.onButtonKeyDown}
              type="button"
              aria-label={content.sessionActions}
              aria-haspopup="menu"
              aria-expanded={menuVisible}
              className="sider-action-btn flex size-[20px] cursor-pointer items-center justify-center rounded-[4px] border-0 p-0 text-t-secondary transition-colors hover:text-t-primary"
              onClick={(event) => {
                event.stopPropagation();
                setMenuVisible(true);
              }}
            >
              <MoreOne
                theme="outline"
                size="14"
                fill="currentColor"
                className="block leading-none"
              />
            </button>
          </Dropdown>
        </div>
      </div>
    </Tooltip>
  );
}
