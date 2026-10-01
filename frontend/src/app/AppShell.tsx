import { Bell, Monitor, Moon, Search, Sun } from "lucide-react";
import { ArrowCircleLeft, SettingTwo } from "@icon-park/react";
import { useEffect, useRef, useState } from "react";
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
  const sidebarWidth = useAppUiStore((state) => state.sidebarWidth);
  const setSidebarWidth = useAppUiStore((state) => state.setSidebarWidth);
  const setSidebarCollapsed = useAppUiStore(
    (state) => state.setSidebarCollapsed,
  );
  const themeMode = useAppUiStore((state) => state.themeMode);
  const setThemeMode = useAppUiStore((state) => state.setThemeMode);
  const toggleSidebar = useAppUiStore((state) => state.toggleSidebar);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const update = () => {
      setMobile(media.matches);
      if (media.matches) setSidebarCollapsed(true);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [setSidebarCollapsed]);
  const toggleLabel = sidebarCollapsed
    ? content.expandSidebar
    : content.collapseSidebar;

  return (
    <div className="flex h-screen min-h-[480px] min-w-0 flex-col overflow-hidden bg-muted">
      <AppTitlebar
        sidebarCollapsed={sidebarCollapsed}
        sidebarWidth={mobile ? 0 : sidebarWidth}
        toggleLabel={toggleLabel}
        onToggleSidebar={toggleSidebar}
      />

      <div
        className="grid min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-200 ease-out"
        style={{
          gridTemplateColumns: mobile
            ? "minmax(0, 1fr)"
            : `${sidebarCollapsed ? 56 : sidebarWidth}px minmax(0, 1fr)`,
        }}
      >
        {mobile && !sidebarCollapsed ? (
          <button
            type="button"
            className="fixed inset-0 top-[45px] z-30 bg-overlay"
            aria-label={content.collapseSidebar}
            onClick={() => setSidebarCollapsed(true)}
          />
        ) : null}
        <aside
          id="task-sidebar"
          className={cn(
            "flex min-w-0 flex-col overflow-hidden border-r border-border bg-[var(--bg-2)] px-2",
            mobile &&
              "fixed top-[45px] bottom-0 left-0 z-40 w-[min(86vw,320px)] shadow-lg transition-transform duration-200",
            mobile && sidebarCollapsed && "-translate-x-full",
          )}
          aria-label={content.sidebarLabel}
        >
          <div
            className={cn(
              "flex h-12 shrink-0 items-center whitespace-nowrap text-foreground",
              sidebarCollapsed ? "justify-center" : "gap-3 px-2.5",
            )}
            aria-label={sidebarCollapsed ? content.productName : undefined}
          >
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-primary text-primary-foreground shadow-sm [&>svg]:size-6"
              dangerouslySetInnerHTML={{ __html: kunyuLogo }}
              aria-hidden="true"
            />
            {sidebarCollapsed ? null : (
              <span className="text-base font-semibold tracking-normal">
                {content.productName}
              </span>
            )}
            {sidebarCollapsed ? null : (
              <div className="ml-auto flex items-center gap-1 text-muted-foreground">
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

          <div className="mt-auto flex shrink-0 items-center border-t border-[var(--color-border-2)] py-[6px]">
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
                  isSettings ? returnPath.current : "/settings/archived",
                )
              }
            />
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
              aria-label={content.theme[themeMode]}
              title={content.theme[themeMode]}
              onClick={() =>
                setThemeMode(
                  themeMode === "system"
                    ? "light"
                    : themeMode === "light"
                      ? "dark"
                      : "system",
                )
              }
            >
              {themeMode === "system" ? (
                <Monitor size={14} />
              ) : themeMode === "dark" ? (
                <Moon size={14} />
              ) : (
                <Sun size={14} />
              )}
            </button>
          </div>
          {sidebarCollapsed || mobile ? null : (
            <div
              className="absolute bottom-0 top-[45px] z-40 w-1 cursor-col-resize touch-none hover:bg-[var(--mu-accent-border)] active:bg-[var(--mu-accent-border)]"
              style={{ left: sidebarWidth - 2 }}
              role="separator"
              aria-label={content.resizeSidebar}
              aria-orientation="vertical"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  setSidebarWidth(event.clientX);
                }
              }}
              onPointerUp={(event) =>
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            />
          )}
        </aside>

        <main className="min-h-0 min-w-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
