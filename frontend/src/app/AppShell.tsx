import { Archive, Bell, Search, Settings } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";

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
          className="flex min-w-0 flex-col overflow-hidden border-r border-slate-200 bg-white px-2"
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

          <TaskSidebarContent
            collapsed={sidebarCollapsed}
            onRequestExpand={toggleSidebar}
          />

          <div className="grid shrink-0 border-t border-slate-200 py-2">
            <SidebarItem collapsed={sidebarCollapsed} icon={<Archive size={16} strokeWidth={1.8} />}
              label={zhCN.archivedSessions.title} onClick={() => void navigate("/settings/archived")} />
            <SidebarItem
              collapsed={sidebarCollapsed}
              disabled
              icon={<Settings size={16} strokeWidth={1.8} />}
              label={content.settings}
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
