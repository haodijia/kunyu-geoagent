import { Button } from "@/components/ui/button";
import { mcpApi, type McpServer } from "@/features/settings/mcp/api";
import { mcpError, mcpQueryKey } from "@/features/settings/mcp/model";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQueryClient } from "@tanstack/vue-query";
import { LoaderCircle, LogIn, LogOut } from "lucide-vue-next";
import { computed, defineComponent, shallowRef } from "vue";
const content = zhCN.mcp;
export const McpOAuthControls = defineComponent(
  (
    componentProps: {
      readonly server: McpServer;
    },
    { slots: _slots },
  ) => {
    const server = computed(() => componentProps.server);
    const cache = useQueryClient(),
      pending = shallowRef(false),
      error = shallowRef<string | null>(null),
      setPending = refSetter(pending),
      setError = refSetter(error);
    const initiated = shallowRef<string | null>(null),
      opened = shallowRef<string | null>(null);
    const flow = computed(() => server.value.auth.flow);
    watchMounted([() => flow.value], () => {
      if (
        flow.value?.authorization_url !== null &&
        flow.value?.authorization_url !== undefined &&
        initiated.value === flow.value.id &&
        opened.value !== flow.value.id
      ) {
        opened.value = flow.value.id;
        window.open(flow.value.authorization_url, "_blank", "noreferrer");
      }
    });
    async function act(kind: "login" | "logout" | "cancel") {
      setPending(true);
      setError(null);
      try {
        if (kind === "login") {
          const next = await mcpApi.login(
            server.value.config.name,
            server.value.revision,
          );
          initiated.value = next.id;
        } else if (kind === "logout")
          await mcpApi.logout(server.value.config.name, server.value.revision);
        else if (flow.value !== null)
          await mcpApi.cancelLogin(server.value.config.name, flow.value.id);
        await cache.invalidateQueries({
          queryKey: mcpQueryKey,
        });
      } catch (error) {
        console.error("[mcp] OAuth action failed.", error);
        setError(mcpError(error));
      } finally {
        setPending(false);
      }
    }
    const failed = computed(() => flow.value?.status === "failed");
    const failure = computed(() =>
      flow.value?.error_code === "MCP_OAUTH_DENIED"
        ? content.oauthDenied
        : flow.value?.error_code === "MCP_OAUTH_TIMEOUT"
          ? content.oauthTimedOut
          : content.oauthFailed,
    );
    return () => {
      const _server = server.value,
        _flow = flow.value,
        _failed = failed.value,
        _failure = failure.value;
      return (
        <div
          class="mt-3 ml-5 flex flex-col gap-2 text-xs text-t-secondary"
          data-mcp-oauth={_server.config.name}
        >
          {_server.auth.in_flight ? (
            <>
              <div class="flex flex-wrap items-center gap-2">
                <LoaderCircle class="size-3.5 animate-spin" />
                {_flow?.status === "waiting"
                  ? content.waitingAuthorization
                  : content.authorizing}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending.value}
                  onClick={() => void act("cancel")}
                >
                  {content.cancelAuthorization}
                </Button>
              </div>
              {_flow?.authorization_url && (
                <a
                  class="w-fit underline underline-offset-2"
                  href={_flow.authorization_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {content.openAuthorization}
                </a>
              )}
            </>
          ) : (
            <div class="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending.value}
                onClick={() => void act("login")}
              >
                <LogIn class="size-3.5" />
                {content.signIn}
              </Button>
              {_server.auth.authenticated && (
                <>
                  <span>{content.oauthAuthorized}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending.value}
                    onClick={() => void act("logout")}
                  >
                    <LogOut class="size-3.5" />
                    {content.signOut}
                  </Button>
                </>
              )}
            </div>
          )}
          {_failed && (
            <p class="text-destructive" role="alert">
              {_failure}
            </p>
          )}
          {_flow?.status === "cancelled" && <p>{content.oauthCancelled}</p>}
          {error.value !== null && (
            <p class="text-destructive" role="alert">
              {error.value}
            </p>
          )}
        </div>
      );
    };
  },
  {
    name: "McpOAuthControls",
    inheritAttrs: false,
    props: ["server"],
  },
);
