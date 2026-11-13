import { Input } from "@/components/ui/input";
import type { McpConfig, McpOAuthOptions } from "@/features/settings/mcp/api";
import { zhCN } from "@/locales/zh-CN";
import { computed, defineComponent } from "vue";
const content = zhCN.mcp;
const initial: McpOAuthOptions = {
  client_id: null,
  client_metadata_url: null,
  scopes: [],
};
export const McpOAuthSettings = defineComponent(
  (
    componentProps: {
      readonly config: McpConfig;
      readonly pending: boolean;
      readonly onChange: (config: McpConfig) => void;
    },
    { slots: _slots },
  ) => {
    const config = computed(() => componentProps.config),
      pending = computed(() => componentProps.pending),
      onChange = computed(() => componentProps.onChange);
    const options = computed(() => config.value.oauth);
    return () => {
      const _pending = pending.value,
        _config = config.value,
        _onChange = onChange.value,
        _options = options.value;
      return (
        <fieldset class="flex flex-col gap-4" disabled={_pending}>
          <label class="flex flex-col gap-2 text-[13px]">
            {content.authentication}
            <select
              class="h-9 rounded-md border bg-background px-3"
              value={_config.auth_mode}
              onChange={(e) =>
                _onChange({
                  ..._config,
                  auth_mode: (e.target as HTMLInputElement)
                    .value as McpConfig["auth_mode"],
                  oauth:
                    (e.target as HTMLInputElement).value === "oauth"
                      ? initial
                      : null,
                })
              }
            >
              <option value="headers">{content.headerAuth}</option>
              <option value="oauth">{content.oauthAuth}</option>
            </select>
          </label>
          {_options !== null && (
            <>
              <p class="text-xs text-t-secondary">{content.oauthDescription}</p>
              <label class="flex flex-col gap-2 text-[13px]">
                {content.oauthClientId}
                <Input
                  value={_options.client_id === null ? "" : _options.client_id}
                  onInput={(e) =>
                    _onChange({
                      ..._config,
                      oauth: {
                        ..._options,
                        client_id:
                          (e.target as HTMLInputElement).value === ""
                            ? null
                            : (e.target as HTMLInputElement).value,
                      },
                    })
                  }
                />
              </label>
              <label class="flex flex-col gap-2 text-[13px]">
                {content.oauthMetadataUrl}
                <Input
                  value={
                    _options.client_metadata_url === null
                      ? ""
                      : _options.client_metadata_url
                  }
                  onInput={(e) =>
                    _onChange({
                      ..._config,
                      oauth: {
                        ..._options,
                        client_metadata_url:
                          (e.target as HTMLInputElement).value === ""
                            ? null
                            : (e.target as HTMLInputElement).value,
                      },
                    })
                  }
                />
              </label>
              <label class="flex flex-col gap-2 text-[13px]">
                {content.oauthScopes}
                <Input
                  value={_options.scopes.join(" ")}
                  onInput={(e) =>
                    _onChange({
                      ..._config,
                      oauth: {
                        ..._options,
                        scopes:
                          (e.target as HTMLInputElement).value.trim() === ""
                            ? []
                            : (e.target as HTMLInputElement).value
                                .trim()
                                .split(/\s+/),
                      },
                    })
                  }
                />
              </label>
            </>
          )}
        </fieldset>
      );
    };
  },
  {
    name: "McpOAuthSettings",
    inheritAttrs: false,
    props: ["config", "pending", "onChange"],
  },
);
