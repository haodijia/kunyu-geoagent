import { Tooltip } from "@/components/ui/tooltip";
import { Cube, Inbox } from "@icon-park/react";
import { Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";

export function SettingsSidebar({
  collapsed
}: {
  readonly collapsed: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const items = [
    {
      path: "/settings/models",
      label: zhCN.modelConnections.title,
      icon: <Cube theme="outline" size="16" strokeWidth={3} />
    },
    {
      path: "/settings/skills",
      label: zhCN.skills.title,
      icon: <Sparkles size={16} />
    },
    {
      path: "/settings/archived",
      label: zhCN.archivedSessions.title,
      icon: <Inbox theme="outline" size="16" strokeWidth={3} />
    }
  ] as const;
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
        {items.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <Tooltip key={item.path} label={item.label} side="right" visible={collapsed}>
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={cn(
                  "relative flex h-[32px] shrink-0 cursor-pointer items-center gap-[8px] overflow-hidden rounded-[6px] border-0 transition-colors",
                  active ? "bg-fill-2" : "bg-transparent hover:bg-fill-1",
                  collapsed ? "w-full justify-center px-0" : "justify-start px-[8px]"
                )}
                onClick={() => void navigate(item.path, { replace: true })}
              >
                <span className="flex size-[22px] shrink-0 items-center justify-center leading-none text-t-primary">
                  {item.icon}
                </span>
                {!collapsed ? (
                  <span
                    className={cn(
                      "inline-block h-[24px] w-full overflow-hidden text-left text-[13px] leading-[24px] text-nowrap text-t-primary",
                      active ? "font-semibold" : "font-medium"
                    )}
                  >
                    {item.label}
                  </span>
                ) : null}
              </button>
            </Tooltip>
          );
        })}
      </div>
    </nav>
  );
}
