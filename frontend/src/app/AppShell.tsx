import { useNavigation } from "@/app/navigation";
import { useAppUiStore } from "@/app/store";
import { AppTitlebar } from "@/components/layout/AppTitlebar";
import { SidebarItem } from "@/components/navigation/SidebarItem";
import { SettingsSidebar } from "@/features/settings/SettingsSidebar";
import type { Workspace } from "@/features/workspaces/api";
import { WorkspaceUploadDialog } from "@/features/workspaces/files/WorkspaceUploadDialog";
import { TaskSidebarContent } from "@/features/workspaces/sidebar/TaskSidebarContent";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import { ArrowCircleLeft, SettingTwo } from "@icon-park/vue-next";
import { Monitor, Moon, Search, Sun, X } from "lucide-vue-next";
import { computed, defineComponent, shallowRef } from "vue";
import { RouterView, useRoute } from "vue-router";
import kunyuLogo from "../../../assets/kunyu.svg?raw";
const content = zhCN.shell;
export const AppShell = defineComponent(
  (_props, { slots: _slots }) => {
    const navigate = useNavigation();
    const location = useRoute();
    const isSettings = computed(() => location.path.startsWith("/settings/"));
    const returnPath = shallowRef("/");
    watchMounted([() => location.path], () => {
      if (!isSettings.value) returnPath.value = location.path;
    });
    const sidebarCollapsed = computed(() =>
      ((state) => state.sidebarCollapsed)(useAppUiStore()),
    );
    const sidebarWidth = computed(() =>
      ((state) => state.sidebarWidth)(useAppUiStore()),
    );
    const setSidebarWidth = computed(() =>
      ((state) => state.setSidebarWidth)(useAppUiStore()),
    );
    const setSidebarCollapsed = computed(() =>
      ((state) => state.setSidebarCollapsed)(useAppUiStore()),
    );
    const themeMode = computed(() =>
      ((state) => state.themeMode)(useAppUiStore()),
    );
    const setThemeMode = computed(() =>
      ((state) => state.setThemeMode)(useAppUiStore()),
    );
    const toggleSidebar = computed(() =>
      ((state) => state.toggleSidebar)(useAppUiStore()),
    );
    const mobile = shallowRef(false),
      setMobile = refSetter(mobile);
    const uploadWorkspace = shallowRef<Workspace | null>(null),
      setUploadWorkspace = refSetter(uploadWorkspace);
    watchMounted([() => location.path], () => setUploadWorkspace(null));
    const searchOpen = shallowRef(false),
      setSearchOpen = refSetter(searchOpen);
    const search = shallowRef(""),
      setSearch = refSetter(search);
    const searchInput = shallowRef<HTMLInputElement | null>(null);
    const openSearch = () => {
      setSidebarCollapsed.value(false);
      if (isSettings.value) void navigate(returnPath.value);
      setSearchOpen(true);
      requestAnimationFrame(() => searchInput.value?.focus());
    };
    function closeSearch() {
      setSearchOpen(false);
      setSearch("");
    }
    watchMounted([() => openSearch], () => {
      const handler = (event: KeyboardEvent) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          openSearch();
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    });
    watchMounted([() => setSidebarCollapsed.value], () => {
      const media = window.matchMedia("(max-width: 720px)");
      const update = () => {
        setMobile(media.matches);
        if (media.matches) setSidebarCollapsed.value(true);
      };
      update();
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    });
    const toggleLabel = computed(() =>
      sidebarCollapsed.value ? content.expandSidebar : content.collapseSidebar,
    );
    return () => {
      const _sidebarCollapsed = sidebarCollapsed.value,
        _sidebarWidth = sidebarWidth.value,
        _toggleLabel = toggleLabel.value,
        _toggleSidebar = toggleSidebar.value,
        _setSidebarCollapsed = setSidebarCollapsed.value,
        _isSettings = isSettings.value,
        _themeMode = themeMode.value,
        _setThemeMode = setThemeMode.value,
        _setSidebarWidth = setSidebarWidth.value;
      return (
        <div class="flex h-screen min-h-[480px] min-w-0 flex-col overflow-hidden bg-muted">
          <AppTitlebar
            sidebarCollapsed={_sidebarCollapsed}
            sidebarWidth={mobile.value ? 0 : _sidebarWidth}
            toggleLabel={_toggleLabel}
            onToggleSidebar={_toggleSidebar}
          />

          <div
            class="grid min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-200 ease-out"
            style={{
              gridTemplateColumns: mobile.value
                ? "minmax(0, 1fr)"
                : `${_sidebarCollapsed ? 56 : _sidebarWidth}px minmax(0, 1fr)`,
            }}
          >
            {mobile.value && !_sidebarCollapsed ? (
              <button
                type="button"
                class="fixed inset-0 top-[45px] z-30 bg-overlay"
                aria-label={content.collapseSidebar}
                onClick={() => _setSidebarCollapsed(true)}
              />
            ) : null}
            <aside
              id="task-sidebar"
              class={cn(
                "flex min-w-0 flex-col overflow-hidden border-r border-border bg-[var(--bg-2)] px-2",
                mobile.value &&
                  "fixed top-[45px] bottom-0 left-0 z-40 w-[min(86vw,320px)] shadow-lg transition-transform duration-200",
                mobile.value && _sidebarCollapsed && "-translate-x-full",
              )}
              aria-label={content.sidebarLabel}
            >
              <div
                class={cn(
                  "flex h-12 shrink-0 items-center whitespace-nowrap text-foreground",
                  _sidebarCollapsed ? "justify-center" : "gap-3 px-2.5",
                )}
                aria-label={_sidebarCollapsed ? content.productName : undefined}
              >
                <span
                  class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-primary text-primary-foreground shadow-sm [&>svg]:size-6"
                  innerHTML={kunyuLogo}
                  aria-hidden="true"
                />
                {_sidebarCollapsed ? null : searchOpen.value ? (
                  <input
                    id="sidebar-search"
                    ref={searchInput}
                    class="h-7 min-w-0 flex-1 rounded-md border-0 bg-accent px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    aria-label={content.search}
                    placeholder={zhCN.workspaceSidebar.searchPlaceholder}
                    value={search.value}
                    onInput={(event) =>
                      setSearch((event.target as HTMLInputElement).value)
                    }
                    onKeydown={(event) => {
                      if (event.key === "Escape") closeSearch();
                    }}
                  />
                ) : (
                  <span class="text-base font-semibold tracking-normal">
                    {content.productName}
                  </span>
                )}
                {_sidebarCollapsed ? null : (
                  <div class="ml-auto flex items-center gap-1 text-muted-foreground">
                    <button
                      type="button"
                      class="flex size-8 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      aria-label={
                        searchOpen.value
                          ? zhCN.workspaceSidebar.close
                          : content.search
                      }
                      aria-expanded={searchOpen.value}
                      aria-controls={
                        searchOpen.value ? "sidebar-search" : undefined
                      }
                      onClick={searchOpen.value ? closeSearch : openSearch}
                    >
                      {searchOpen.value ? (
                        <X size={16} strokeWidth={1.8} aria-hidden="true" />
                      ) : (
                        <Search
                          size={16}
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </div>
                )}
              </div>
              {_isSettings ? (
                <SettingsSidebar collapsed={_sidebarCollapsed} />
              ) : (
                <TaskSidebarContent
                  collapsed={_sidebarCollapsed}
                  onRequestExpand={_toggleSidebar}
                  search={search.value}
                  onUpload={setUploadWorkspace}
                />
              )}

              <div class="mt-auto flex shrink-0 items-center border-t border-[var(--color-border-2)] py-[6px]">
                <SidebarItem
                  collapsed={_sidebarCollapsed}
                  icon={
                    _isSettings ? (
                      <ArrowCircleLeft
                        theme="outline"
                        size="16"
                        fill="currentColor"
                      />
                    ) : (
                      <SettingTwo
                        theme="outline"
                        size="16"
                        fill="currentColor"
                      />
                    )
                  }
                  label={_isSettings ? zhCN.settings.back : content.settings}
                  onClick={() =>
                    void navigate(
                      _isSettings ? returnPath.value : "/settings/archived",
                    )
                  }
                />
                <button
                  type="button"
                  class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                  aria-label={content.theme[_themeMode]}
                  title={content.theme[_themeMode]}
                  onClick={() =>
                    _setThemeMode(
                      _themeMode === "system"
                        ? "light"
                        : _themeMode === "light"
                          ? "dark"
                          : "system",
                    )
                  }
                >
                  {_themeMode === "system" ? (
                    <Monitor size={14} />
                  ) : _themeMode === "dark" ? (
                    <Moon size={14} />
                  ) : (
                    <Sun size={14} />
                  )}
                </button>
              </div>
              {_sidebarCollapsed || mobile.value ? null : (
                <div
                  class="absolute bottom-0 top-[45px] z-40 w-1 cursor-col-resize touch-none hover:bg-[var(--mu-accent-border)] active:bg-[var(--mu-accent-border)]"
                  style={{
                    left: `${_sidebarWidth - 2}px`,
                  }}
                  role="separator"
                  aria-label={content.resizeSidebar}
                  aria-orientation="vertical"
                  onPointerdown={(event) => {
                    (event.currentTarget as HTMLElement).setPointerCapture(
                      event.pointerId,
                    );
                  }}
                  onPointermove={(event) => {
                    if (
                      (event.currentTarget as HTMLElement).hasPointerCapture(
                        event.pointerId,
                      )
                    ) {
                      _setSidebarWidth(event.clientX);
                    }
                  }}
                  onPointerup={(event) =>
                    (event.currentTarget as HTMLElement).releasePointerCapture(
                      event.pointerId,
                    )
                  }
                />
              )}
            </aside>

            <main class="min-h-0 min-w-0 overflow-auto">
              <RouterView key={JSON.stringify(location.params)} />
            </main>
          </div>
          {uploadWorkspace.value !== null && (
            <WorkspaceUploadDialog
              workspace={uploadWorkspace.value}
              onClose={() => setUploadWorkspace(null)}
            />
          )}
        </div>
      );
    };
  },
  {
    name: "AppShell",
    inheritAttrs: false,
    props: [],
  },
);
