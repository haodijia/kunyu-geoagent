import { useNavigation } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  SettingsPageHeader,
  SettingsPageWrapper,
} from "@/features/settings/SettingsPage";
import { McpOAuthSettings } from "@/features/settings/mcp/McpOAuthSettings";
import {
  mcpApi,
  type McpConfig,
  type McpServer,
} from "@/features/settings/mcp/api";
import { mcpError, mcpQueryKey } from "@/features/settings/mcp/model";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { ArrowLeft, LoaderCircle } from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
import { useRoute } from "vue-router";
const content = zhCN.mcp;
const blank: McpConfig = {
  name: "",
  transport: "streamable-http",
  auth_mode: "headers",
  oauth: null,
  url: "",
  command: null,
  args: [],
  cwd: null,
  enabled: false,
  tool_timeout_ms: 60000,
  read_only_tools: [],
  reconnect: {
    enabled: true,
    initial_delay_ms: 500,
    max_delay_ms: 30000,
    max_attempts: 10,
  },
};
export const McpServerEditorPage = defineComponent(
  (_props, { slots: _slots }) => {
    const _route = useRoute(),
      serverName = computed(() =>
        _route.params.serverName === undefined
          ? undefined
          : String(_route.params.serverName),
      ),
      navigate = useNavigation();
    const query = reactive(
      useQuery(
        computed(() => ({
          queryKey: mcpQueryKey,
          queryFn: mcpApi.list,
          enabled: serverName.value !== undefined,
        })),
      ),
    );
    const server = computed(() =>
      serverName.value === undefined
        ? null
        : query.data?.find((server) => server.config.name === serverName.value),
    );
    return () => {
      const _serverName = serverName.value,
        _server = server.value;
      return (
        <SettingsPageWrapper>
          <SettingsPageHeader
            title={
              _serverName === undefined
                ? content.add
                : content.edit(_serverName)
            }
            description={content.editorDescription}
            actions={null}
            navigation={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void navigate("/settings/mcp")}
              >
                <ArrowLeft class="size-3.5" />
                {content.back}
              </Button>
            }
          />
          {_serverName !== undefined && query.isPending ? (
            <div class="model-loading">
              <LoaderCircle class="size-5 animate-spin" />
              {content.loading}
            </div>
          ) : query.isError ? (
            <p role="alert" class="mt-6 text-destructive">
              {mcpError(query.error)}
            </p>
          ) : _server === undefined ? (
            <p class="mt-6" role="alert">
              {content.notFound}
            </p>
          ) : (
            <Editor
              key={_server === null ? "new" : _server.config.name}
              server={_server}
            />
          )}
        </SettingsPageWrapper>
      );
    };
  },
  {
    name: "McpServerEditorPage",
    inheritAttrs: false,
    props: [],
  },
);
const Editor = defineComponent(
  (
    componentProps: {
      readonly server: McpServer | null;
    },
    { slots: _slots },
  ) => {
    const server = computed(() => componentProps.server);
    const config = shallowRef<McpConfig>(
        server.value === null ? blank : server.value.config,
      ),
      args = shallowRef(
        JSON.stringify(server.value === null ? [] : server.value.config.args),
      ),
      error = shallowRef<string | null>(null),
      pending = shallowRef(false),
      secretText = shallowRef("{}"),
      secretStatus = shallowRef<string | null>(null),
      setConfig = refSetter(config),
      setArgs = refSetter(args),
      setError = refSetter(error),
      setPending = refSetter(pending),
      setSecretText = refSetter(secretText),
      setSecretStatus = refSetter(secretStatus);
    const revision = shallowRef(
        server.value === null ? 1 : server.value.revision,
      ),
      setRevision = refSetter(revision);
    const cache = useQueryClient(),
      navigate = useNavigation();
    async function save(event: SubmitEvent) {
      event.preventDefault();
      setError(null);
      setPending(true);
      try {
        const parsed: unknown = JSON.parse(args.value);
        if (
          !Array.isArray(parsed) ||
          parsed.some((arg) => typeof arg !== "string")
        )
          throw Error(content.argsInvalid);
        const body = {
          ...config.value,
          args: config.value.transport === "stdio" ? parsed : [],
        };
        if (server.value === null) await mcpApi.create(body);
        else await mcpApi.update(body, revision.value);
        await cache.invalidateQueries({
          queryKey: mcpQueryKey,
        });
        void navigate("/settings/mcp");
      } catch (error) {
        setError(mcpError(error));
      } finally {
        setPending(false);
      }
    }
    async function saveSecrets(event: SubmitEvent) {
      event.preventDefault();
      setError(null);
      setSecretStatus(null);
      setPending(true);
      try {
        const parsed: unknown = JSON.parse(secretText.value);
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed) ||
          Object.values(parsed).some((value) => typeof value !== "string")
        )
          throw Error(content.secretsInvalid);
        const updated = await mcpApi.secrets(
          config.value.name,
          server.value!.config.transport,
          parsed as Record<string, string>,
          revision.value,
        );
        setRevision(updated.revision);
        setSecretText("{}");
        setSecretStatus(content.secretsSaved);
        await cache.invalidateQueries({
          queryKey: mcpQueryKey,
        });
      } catch (error) {
        setError(mcpError(error));
      } finally {
        setPending(false);
      }
    }
    const inputClass = "w-full";
    return () => {
      const _server2 = server.value;
      return (
        <div class="mt-6 max-w-[720px]">
          <form
            class="flex flex-col gap-5"
            onSubmit={(event) => void save(event)}
          >
            <label class="flex flex-col gap-2 text-[13px]">
              {content.name}
              <Input
                class={inputClass}
                value={config.value.name}
                required
                pattern={"[A-Za-z0-9_\\-]{1,32}"}
                disabled={pending.value || _server2 !== null}
                onInput={(e) =>
                  setConfig({
                    ...config.value,
                    name: (e.target as HTMLInputElement).value,
                  })
                }
              />
            </label>
            <label class="flex flex-col gap-2 text-[13px]">
              {content.transport}
              <select
                class="h-9 rounded-md border bg-background px-3"
                value={config.value.transport}
                disabled={pending.value}
                onChange={(e) => {
                  const transport = (e.target as HTMLInputElement)
                    .value as McpConfig["transport"];
                  setConfig({
                    ...config.value,
                    transport,
                    auth_mode: "headers",
                    oauth: null,
                    url: transport === "streamable-http" ? "" : null,
                    command: transport === "stdio" ? "" : null,
                    args: [],
                    cwd: null,
                  });
                  setArgs("[]");
                }}
              >
                <option value="streamable-http">Streamable HTTP</option>
                <option value="stdio">{content.stdio}</option>
              </select>
            </label>
            {config.value.transport === "streamable-http" ? (
              <label class="flex flex-col gap-2 text-[13px]">
                {content.url}
                <Input
                  class={inputClass}
                  value={config.value.url!}
                  required
                  placeholder="https://example.com/mcp"
                  disabled={pending.value}
                  onInput={(e) =>
                    setConfig({
                      ...config.value,
                      url: (e.target as HTMLInputElement).value,
                    })
                  }
                />
              </label>
            ) : (
              <>
                <label class="flex flex-col gap-2 text-[13px]">
                  {content.command}
                  <Input
                    class={inputClass}
                    value={config.value.command!}
                    required
                    disabled={pending.value}
                    onInput={(e) =>
                      setConfig({
                        ...config.value,
                        command: (e.target as HTMLInputElement).value,
                      })
                    }
                  />
                </label>
                <label class="flex flex-col gap-2 text-[13px]">
                  {content.args}
                  <Input
                    class={`${inputClass} font-mono text-xs`}
                    value={args.value}
                    disabled={pending.value}
                    onInput={(e) =>
                      setArgs((e.target as HTMLInputElement).value)
                    }
                  />
                </label>
                <label class="flex flex-col gap-2 text-[13px]">
                  {content.cwd}
                  <Input
                    class={inputClass}
                    value={config.value.cwd === null ? "" : config.value.cwd}
                    disabled={pending.value}
                    onInput={(e) =>
                      setConfig({
                        ...config.value,
                        cwd:
                          (e.target as HTMLInputElement).value === ""
                            ? null
                            : (e.target as HTMLInputElement).value,
                      })
                    }
                  />
                </label>
              </>
            )}
            {config.value.transport === "streamable-http" && (
              <McpOAuthSettings
                config={config.value}
                pending={pending.value}
                onChange={setConfig}
              />
            )}
            <label class="flex flex-col gap-2 text-[13px]">
              {content.timeout}
              <Input
                type="number"
                min={1000}
                max={300000}
                step={1000}
                value={config.value.tool_timeout_ms}
                disabled={pending.value}
                onInput={(e) =>
                  setConfig({
                    ...config.value,
                    tool_timeout_ms: Number(
                      (e.target as HTMLInputElement).value,
                    ),
                  })
                }
              />
            </label>
            <label class="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={config.value.reconnect.enabled}
                disabled={pending.value}
                onUpdate:modelValue={(value) =>
                  setConfig({
                    ...config.value,
                    reconnect: {
                      ...config.value.reconnect,
                      enabled: value === true,
                    },
                  })
                }
              />
              {content.autoReconnect}
            </label>
            <label class="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={config.value.enabled}
                disabled={pending.value}
                onUpdate:modelValue={(value) =>
                  setConfig({
                    ...config.value,
                    enabled: value === true,
                  })
                }
              />
              {content.enabled}
            </label>
            <div>
              <Button type="submit" disabled={pending.value}>
                {pending.value ? (
                  <LoaderCircle class="size-4 animate-spin" />
                ) : null}
                {content.save}
              </Button>
            </div>
          </form>
          {_server2 !== null && (
            <form
              class="mt-8 flex flex-col gap-3 border-t pt-5"
              onSubmit={(event) => void saveSecrets(event)}
            >
              <h2 class="text-sm font-medium">{content.credentials}</h2>
              <p class="text-xs text-t-secondary">{content.secretHint}</p>
              <p class="text-xs text-t-secondary">
                {content.secretNames(_server2.secret_keys)}
              </p>
              <label class="flex flex-col gap-2 text-[13px]">
                {_server2.config.transport === "stdio"
                  ? content.env
                  : content.headers}
                <textarea
                  class="min-h-24 w-full rounded-md border bg-background p-3 font-mono text-xs"
                  value={secretText.value}
                  disabled={pending.value}
                  onInput={(e) =>
                    setSecretText((e.target as HTMLInputElement).value)
                  }
                />
              </label>
              <div>
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={pending.value}
                >
                  {content.replaceSecrets}
                </Button>
              </div>
              {secretStatus.value !== null && (
                <p class="text-xs text-success" role="status">
                  {secretStatus.value}
                </p>
              )}
            </form>
          )}
          {error.value !== null && (
            <p class="mt-4 text-sm text-destructive" role="alert">
              {error.value}
            </p>
          )}
        </div>
      );
    };
  },
  {
    name: "Editor",
    inheritAttrs: false,
    props: ["server"],
  },
);
