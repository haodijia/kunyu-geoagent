import { AlarmClock, Box, Ellipsis, Plus, Settings } from "lucide-react";
import { Outlet } from "react-router-dom";

import kunyuLogo from "../../../assets/kunyu.svg?raw";
import { AppTitlebar } from "@/components/layout/AppTitlebar";
import { SidebarItem } from "@/components/navigation/SidebarItem";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.shell;

export function AppShell() {
  return (
    <div className="flex h-screen min-h-[480px] min-w-[640px] flex-col overflow-hidden bg-slate-50">
      <AppTitlebar />

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden max-[820px]:grid-cols-[232px_minmax(0,1fr)]">
        <aside
          className="flex min-w-0 flex-col overflow-hidden border-r border-slate-200 bg-white px-2"
          aria-label={content.sidebarLabel}
        >
          <div className="flex h-12 shrink-0 items-center gap-3 px-2.5 whitespace-nowrap text-slate-950">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/70 bg-[#253047] text-slate-50 shadow-sm [&>svg]:size-6"
              dangerouslySetInnerHTML={{ __html: kunyuLogo }}
              aria-hidden="true"
            />
            <span className="text-base font-semibold tracking-tight">
              {content.productName}
            </span>
          </div>

          <nav className="grid gap-0.5" aria-label={content.navigationLabel}>
            <SidebarItem
              framedIcon
              icon={<Plus size={14} strokeWidth={2} />}
              label={content.newChat}
            />
            <SidebarItem
              icon={<Box size={16} strokeWidth={1.8} />}
              label={content.geoSkill}
            />
            <SidebarItem
              icon={<Ellipsis size={18} strokeWidth={2.4} />}
              label={content.explore}
            />
            <SidebarItem
              icon={<AlarmClock size={16} strokeWidth={1.8} />}
              label={content.scheduledTasks}
            />
          </nav>

          <div className="mt-auto grid shrink-0 border-t border-slate-200 py-2">
            <SidebarItem
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
