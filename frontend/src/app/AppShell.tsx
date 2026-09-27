import { Bell, Search } from "lucide-react";
import { ArrowCircleLeft, SettingTwo } from "@icon-park/react";
import { useRef } from "react";
import { SettingsSidebar } from "@/features/settings/SettingsSidebar";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import kunyuLogo from "../../../assets/kunyu.svg?raw";
import { useAppUiStore } from "@/app/store";
import { AppTitlebar } from "@/components/layout/AppTitlebar";
import { SidebarItem } from "@/components/navigation/SidebarItem";
import { TaskSidebarContent } from "@/features/workspaces/TaskSidebarContent";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.shell;

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const isSettings = location.pathname.startsWith("/settings/");
  const returnPath = useRef("/");
  if (!isSettings) returnPath.current = location.pathname;
  const sidebarCollapsed = useAppUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useAppUiStore((state) => state.toggleSidebar);
  const toggleLabel = sidebarCollapsed
    ? content.expandSidebar
    : content.collapseSidebar;

  return (
    <div className="flex h-screen min-h-[480px] min-w-0 flex-col overflow-hidden bg-slate-50">
      <AppTitlebar
        sidebarCollapsed={sidebarCollapsed}
        toggleLabel={toggleLabel}
        onToggleSidebar={toggleSidebar}
      />

      <div
        className={cn(
          "grid min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-200 ease-out",
          sidebarCollapsed
            ? "grid-cols-[56px_minmax(0,1fr)]"
            : "grid-cols-[280px_minmax(0,1fr)] max-[820px]:grid-cols-[232px_minmax(0,1fr)]"
        )}
      >
        <aside
          id="task-sidebar"
          className="flex min-w-0 flex-col overflow-hidden border-r border-slate-200 bg-[var(--bg-2)] px-2"
          aria-label={content.sidebarLabel}
        >
          <div
            className={cn(
              "flex h-12 shrink-0 items-center whitespace-nowrap text-slate-950",
              sidebarCollapsed ? "justify-center" : "gap-3 px-2.5"
            )}
            aria-label={sidebarCollapsed ? content.productName : undefined}
          >
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/70 bg-[#253047] text-slate-50 shadow-sm [&>svg]:size-6"
              dangerouslySetInnerHTML={{ __html: kunyuLogo }}
              aria-hidden="true"
            />
            {sidebarCollapsed ? null : (
              <span className="text-base font-semibold tracking-tight">
                {content.productName}
              </span>
            )}
            {sidebarCollapsed ? null : (
              <div className="ml-auto flex items-center gap-1 text-slate-500">
                <span
                  className="flex size-8 items-center justify-center"
                  role="img"
                  aria-label={content.search}
                >
                  <Search size={16} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span
                  className="flex size-8 items-center justify-center"
                  role="img"
                  aria-label={content.notifications}
                >
                  <Bell size={16} strokeWidth={1.8} aria-hidden="true" />
                </span>
              </div>
            )}
          </div>

          {isSettings ? (
            <SettingsSidebar collapsed={sidebarCollapsed} />
          ) : (
            <TaskSidebarContent
              collapsed={sidebarCollapsed}
              onRequestExpand={toggleSidebar}
            />
          )}

          <div className="mt-auto shrink-0 border-t border-[var(--color-border-2)] py-[8px]">
            <SidebarItem
              collapsed={sidebarCollapsed}
              icon={
                isSettings ? (
                  <ArrowCircleLeft
                    theme="outline"
                    size="16"
                    fill="currentColor"
                  />
                ) : (
                  <SettingTwo theme="outline" size="16" fill="currentColor" />
                )
              }
              label={isSettings ? zhCN.settings.back : content.settings}
              onClick={() =>
                void navigate(
                  isSettings ? returnPath.current : "/settings/archived"
                )
              }
            />
          </div>
        </aside>

        <main className="min-h-0 min-w-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
