import { requestJson } from "@/api/client";
import { useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { webContent } from "@/locales/zh-CN/web";
import { useNavigation } from "@/app/navigation";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import { Api, Cube, Inbox } from "@icon-park/vue-next";
import { FolderOpen, Globe2, Sparkles } from "lucide-vue-next";
import { computed, defineComponent } from "vue";
import { useRoute } from "vue-router";
export const SettingsSidebar = defineComponent(
  (
    componentProps: {
      readonly collapsed: boolean;
    },
    { slots: _slots },
  ) => {
    const collapsed = computed(() => componentProps.collapsed);
    const navigate = useNavigation();
    const client = useQueryClient();
    async function logout() {
      try {
        await requestJson("/api/v1/auth/session", { method: "DELETE" });
        client.clear();
        window.dispatchEvent(new Event("kunyu:unauthorized"));
      } catch (error) {
        console.error("[access] Instance logout failed.", error);
        toast.error(webContent.failed);
      }
    }
    const location = useRoute();
    const items = [
      {
        path: "/settings/storage",
        label: zhCN.storage.title,
        icon: <FolderOpen size={16} />,
      },
      {
        path: "/settings/models",
        label: zhCN.modelConnections.title,
        icon: <Cube theme="outline" size="16" strokeWidth={3} />,
      },
      {
        path: "/settings/oge",
        label: zhCN.oge.title,
        icon: <Globe2 size={16} />,
      },
      {
        path: "/settings/mcp",
        label: zhCN.mcp.title,
        icon: <Api theme="outline" size="16" strokeWidth={3} />,
      },
      {
        path: "/settings/skills",
        label: zhCN.skills.title,
        icon: <Sparkles size={16} />,
      },
      {
        path: "/settings/archived",
        label: zhCN.archivedSessions.title,
        icon: <Inbox theme="outline" size="16" strokeWidth={3} />,
      },
    ] as const;
    return () => {
      const _collapsed = collapsed.value;
      return (
        <nav
          class="settings-sider flex h-full min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-[8px]"
          aria-label={zhCN.settings.title}
        >
          <div
            role="group"
            aria-label={zhCN.settings.system}
            class="flex shrink-0 flex-col gap-[2px]"
          >
            {!_collapsed && (
              <div class="flex h-[24px] items-end overflow-hidden px-[8px] pb-[4px] text-[11px] leading-[16px] font-medium text-nowrap text-t-tertiary">
                {zhCN.settings.system}
              </div>
            )}
            {items.map((item) => {
              const active = location.path.startsWith(item.path);
              return (
                <Tooltip
                  key={item.path}
                  label={item.label}
                  side="right"
                  visible={_collapsed}
                >
                  <button
                    type="button"
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    class={cn(
                      "relative flex h-[32px] shrink-0 cursor-pointer items-center gap-[8px] overflow-hidden rounded-[6px] border-0 transition-colors",
                      active ? "bg-fill-2" : "bg-transparent hover:bg-fill-1",
                      _collapsed
                        ? "w-full justify-center px-0"
                        : "justify-start px-[8px]",
                    )}
                    onClick={() =>
                      void navigate(item.path, {
                        replace: true,
                      })
                    }
                  >
                    <span class="flex size-[22px] shrink-0 items-center justify-center leading-none text-t-primary">
                      {item.icon}
                    </span>
                    {!_collapsed ? (
                      <span
                        class={cn(
                          "inline-block h-[24px] w-full overflow-hidden text-left text-[13px] leading-[24px] text-nowrap text-t-primary",
                          active ? "font-semibold" : "font-medium",
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
          <button
            type="button"
            class="mt-auto rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
            title={webContent.logout}
            onClick={() => void logout()}
          >
            {_collapsed ? "↪" : webContent.logout}
          </button>
        </nav>
      );
    };
  },
  {
    name: "SettingsSidebar",
    inheritAttrs: false,
    props: ["collapsed"],
  },
);
