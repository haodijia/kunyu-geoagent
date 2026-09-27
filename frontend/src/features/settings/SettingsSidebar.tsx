/**
 * Adapted from mu's SettingsSider.tsx. Copyright 2025 AionUi (aionui.com).
 * SPDX-License-Identifier: Apache-2.0
 */
import { Tooltip } from "@arco-design/web-react";
import { Inbox } from "@icon-park/react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";

export function SettingsSidebar({
  collapsed
}: {
  readonly collapsed: boolean;
}) {
  const navigate = useNavigate();
  return (
    <nav
      className="settings-sider flex h-full min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-[8px]"
      aria-label={zhCN.settings.title}
    >
      <div
        role="group"
        aria-label={zhCN.settings.system}
        className="flex shrink-0 flex-col gap-[2px]"
      >
        {!collapsed && (
          <div className="flex h-[24px] items-end overflow-hidden px-[8px] pb-[4px] text-[11px] leading-[16px] font-medium text-nowrap text-t-tertiary">
            {zhCN.settings.system}
          </div>
        )}
        <Tooltip
          content={zhCN.archivedSessions.title}
          position="right"
          disabled={!collapsed}
        >
          <button
            type="button"
            aria-current="page"
            aria-label={zhCN.archivedSessions.title}
            className={cn(
              "relative flex h-[32px] shrink-0 cursor-pointer items-center gap-[8px] overflow-hidden rounded-[6px] border-0 bg-transparent transition-colors",
              collapsed
                ? "w-full justify-center px-0"
                : "justify-start px-[8px]"
            )}
            onClick={() =>
              void navigate("/settings/archived", { replace: true })
            }
          >
            <span className="flex size-[22px] shrink-0 items-center justify-center leading-none">
              <Inbox
                theme="outline"
                size="16"
                strokeWidth={3}
                className="block leading-none text-t-primary"
              />
            </span>
            {!collapsed && (
              <span className="inline-block h-[24px] w-full overflow-hidden text-left text-[13px] leading-[24px] font-semibold text-nowrap text-t-primary">
                {zhCN.archivedSessions.title}
              </span>
            )}
          </button>
        </Tooltip>
      </div>
    </nav>
  );
}
