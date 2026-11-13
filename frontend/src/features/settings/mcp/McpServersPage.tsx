import { useNavigation } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SettingsPageHeader,
  SettingsPageWrapper,
} from "@/features/settings/SettingsPage";
import { McpOAuthControls } from "@/features/settings/mcp/McpOAuthControls";
import { mcpApi, type McpServer } from "@/features/settings/mcp/api";
import { mcpError, mcpQueryKey } from "@/features/settings/mcp/model";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  Check,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
const content = zhCN.mcp;
export const McpServersPage = defineComponent(
  (_props, { slots: _slots }) => {
    const navigate = useNavigation();
    const query = reactive(
      useQuery(
        computed(() => ({
          queryKey: mcpQueryKey,
          queryFn: mcpApi.list,
          refetchInterval: 2500,
        })),
      ),
    );
    return () => {
      return (
        <SettingsPageWrapper>
          <SettingsPageHeader
            title={content.title}
            description={content.description}
            actions={
              <Button
                size="sm"
                onClick={() => void navigate("/settings/mcp/new")}
              >
                <Plus class="size-3.5" />
                {content.add}
              </Button>
            }
          />
          {query.isError && (
            <div class="model-notice model-notice--error mt-6" role="alert">
              <span>{mcpError(query.error)}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void query.refetch()}
              >
                {content.retry}
              </Button>
            </div>
          )}
          {query.isPending ? (
            <div class="model-loading">
              <LoaderCircle class="size-5 animate-spin" />
              {content.loading}
            </div>
          ) : query.data?.length === 0 ? (
            <div class="model-empty">
              <h2>{content.empty}</h2>
              <p>{content.emptyDescription}</p>
            </div>
          ) : (
            <div class="mt-6 divide-y divide-border">
              {query.data?.map((server) => (
                <ServerRow key={server.config.name} server={server} />
              ))}
            </div>
          )}
        </SettingsPageWrapper>
      );
    };
  },
  {
    name: "McpServersPage",
    inheritAttrs: false,
    props: [],
  },
);
const ServerRow = defineComponent(
  (
    componentProps: {
      readonly server: McpServer;
    },
    { slots: _slots },
  ) => {
    const server = computed(() => componentProps.server);
    const expanded = shallowRef(false),
      pending = shallowRef(false),
      error = shallowRef<string | null>(null),
      deleting = shallowRef(false),
      setExpanded = refSetter(expanded),
      setPending = refSetter(pending),
      setError = refSetter(error),
      setDeleting = refSetter(deleting);
    const navigate = useNavigation(),
      cache = useQueryClient();
    const config = computed(() => server.value.config),
      connecting = computed(
        () =>
          server.value.status === "connecting" ||
          server.value.status === "reconnecting",
      );
    async function action(operation: () => Promise<unknown>) {
      setPending(true);
      setError(null);
      try {
        await operation();
        await cache.invalidateQueries({
          queryKey: mcpQueryKey,
        });
        setDeleting(false);
      } catch (error) {
        setError(mcpError(error));
      } finally {
        setPending(false);
      }
    }
    return () => {
      const _config = config.value,
        _connecting = connecting.value,
        _server = server.value;
      return (
        <section class="py-3" data-mcp-server={_config.name}>
          <div class="flex min-w-0 flex-wrap items-center gap-3">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
              aria-expanded={expanded.value}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded.value ? (
                <ChevronDown class="size-3.5 shrink-0" />
              ) : (
                <ChevronRight class="size-3.5 shrink-0" />
              )}
              {_connecting ? (
                <LoaderCircle class="size-4 shrink-0 animate-spin text-t-secondary" />
              ) : _server.status === "connected" ? (
                <Check class="size-4 shrink-0 text-success" />
              ) : _server.status === "failed" ? (
                <X class="size-4 shrink-0 text-destructive" />
              ) : null}
              <span class="min-w-0 truncate text-[13px] font-medium">
                {_config.name}
              </span>
              <span class="shrink-0 text-xs text-t-secondary">
                {content.status[_server.status]}
              </span>
            </button>
            <div class="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                class="size-7"
                disabled={pending.value}
                aria-label={content.reconnect(_config.name)}
                onClick={() =>
                  void action(() => mcpApi.reconnect(_config.name))
                }
              >
                <RefreshCw class="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="size-7"
                disabled={pending.value}
                aria-label={content.edit(_config.name)}
                onClick={() =>
                  void navigate(
                    `/settings/mcp/${encodeURIComponent(_config.name)}`,
                  )
                }
              >
                <Pencil class="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="size-7"
                disabled={pending.value}
                aria-label={content.remove(_config.name)}
                onClick={() => setDeleting((value) => !value)}
              >
                <Trash2 class="size-3.5" />
              </Button>
              <label class="ml-2 flex items-center gap-2 text-xs text-t-secondary">
                <Checkbox
                  checked={_config.enabled}
                  disabled={pending.value}
                  aria-label={content.enabled}
                  onUpdate:modelValue={(checked) =>
                    void action(() =>
                      mcpApi.update(
                        {
                          ..._config,
                          enabled: checked === true,
                        },
                        _server.revision,
                      ),
                    )
                  }
                />
                {content.enabled}
              </label>
            </div>
          </div>
          <div
            class="ml-5 min-w-0 truncate text-xs text-t-secondary"
            title={
              _config.transport === "stdio" ? _config.command! : _config.url!
            }
          >
            {_config.transport === "stdio" ? _config.command : _config.url}
          </div>
          {_config.auth_mode === "oauth" && (
            <McpOAuthControls server={_server} />
          )}
          {error.value !== null && (
            <p role="alert" class="my-2 text-xs text-destructive">
              {error.value}
            </p>
          )}
          {_server.error_code !== null &&
            _server.error_code !== "MCP_AUTH_REQUIRED" && (
              <p class="mt-2 text-xs text-destructive">
                {content.connectionFailed}
              </p>
            )}
          {deleting.value && (
            <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span>{content.deletePrompt(_config.name)}</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending.value}
                onClick={() => void action(() => mcpApi.remove(_config.name))}
              >
                {content.deleteConfirm}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleting(false)}
              >
                {content.cancel}
              </Button>
            </div>
          )}
          {expanded.value && (
            <div class="mt-3 ml-5">
              <p class="mb-2 text-xs text-t-secondary">
                {_server.catalog === null
                  ? content.noCatalog
                  : content.catalog(
                      _server.catalog.tools.length,
                      _server.status !== "connected",
                    )}
              </p>
              <div class="divide-y divide-border">
                {_server.catalog?.tools.map((tool) => (
                  <div key={tool.name} class="flex min-w-0 gap-4 py-2">
                    <div class="w-1/3 min-w-0 shrink-0">
                      <div
                        class="break-words text-[13px] font-medium"
                        title={tool.public_name}
                      >
                        {tool.name}
                      </div>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p
                        class="m-0 truncate text-xs leading-5 text-t-secondary"
                        title={tool.description}
                      >
                        {tool.description}
                      </p>
                      <label class="mt-1 flex items-center gap-2 text-xs text-t-secondary">
                        <Checkbox
                          checked={_config.read_only_tools.includes(tool.name)}
                          disabled={
                            pending.value || _server.status !== "connected"
                          }
                          aria-label={content.readonly(tool.name)}
                          onUpdate:modelValue={(checked) =>
                            void action(() =>
                              mcpApi.update(
                                {
                                  ..._config,
                                  read_only_tools:
                                    checked === true
                                      ? [..._config.read_only_tools, tool.name]
                                      : _config.read_only_tools.filter(
                                          (name) => name !== tool.name,
                                        ),
                                },
                                _server.revision,
                              ),
                            )
                          }
                        />
                        {content.readOnlyLabel}
                        {tool.annotations?.readOnlyHint === true && (
                          <span>{content.serverReadOnly}</span>
                        )}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              {_server.catalog !== null &&
                "resources" in _server.catalog.capabilities && (
                  <p class="mt-3 text-xs text-t-secondary">
                    {content.resources}
                  </p>
                )}
              <p class="mt-3 text-xs text-t-secondary">
                {content.approvalHint}
              </p>
            </div>
          )}
        </section>
      );
    };
  },
  {
    name: "ServerRow",
    inheritAttrs: false,
    props: ["server"],
  },
);
