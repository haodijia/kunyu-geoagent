import { Input } from "@/components/ui/input";
import { zhCN } from "@/locales/zh-CN";
import type { McpConfig, McpOAuthOptions } from "./api";
const content = zhCN.mcp;
const initial: McpOAuthOptions = {
  client_id: null,
  client_metadata_url: null,
  callback_port: 0,
  scopes: [],
};
export function McpOAuthSettings({
  config,
  pending,
  onChange,
}: {
  readonly config: McpConfig;
  readonly pending: boolean;
  readonly onChange: (config: McpConfig) => void;
}) {
  const options = config.oauth;
  return (
    <fieldset className="flex flex-col gap-4" disabled={pending}>
      <label className="flex flex-col gap-2 text-[13px]">
        {content.authentication}
        <select
          className="h-9 rounded-md border bg-background px-3"
          value={config.auth_mode}
          onChange={(e) =>
            onChange({
              ...config,
              auth_mode: e.target.value as McpConfig["auth_mode"],
              oauth: e.target.value === "oauth" ? initial : null,
            })
          }
        >
          <option value="headers">{content.headerAuth}</option>
          <option value="oauth">{content.oauthAuth}</option>
        </select>
      </label>
      {options !== null && (
        <>
          <p className="text-xs text-t-secondary">{content.oauthDescription}</p>
          <label className="flex flex-col gap-2 text-[13px]">
            {content.oauthClientId}
            <Input
              value={options.client_id === null ? "" : options.client_id}
              onChange={(e) =>
                onChange({
                  ...config,
                  oauth: {
                    ...options,
                    client_id: e.target.value === "" ? null : e.target.value,
                  },
                })
              }
            />
          </label>
          <label className="flex flex-col gap-2 text-[13px]">
            {content.oauthMetadataUrl}
            <Input
              value={
                options.client_metadata_url === null
                  ? ""
                  : options.client_metadata_url
              }
              onChange={(e) =>
                onChange({
                  ...config,
                  oauth: {
                    ...options,
                    client_metadata_url:
                      e.target.value === "" ? null : e.target.value,
                  },
                })
              }
            />
          </label>
          <label className="flex flex-col gap-2 text-[13px]">
            {content.oauthCallbackPort}
            <Input
              type="number"
              min={0}
              max={65535}
              value={options.callback_port}
              onChange={(e) =>
                onChange({
                  ...config,
                  oauth: { ...options, callback_port: Number(e.target.value) },
                })
              }
            />
          </label>
          <label className="flex flex-col gap-2 text-[13px]">
            {content.oauthScopes}
            <Input
              value={options.scopes.join(" ")}
              onChange={(e) =>
                onChange({
                  ...config,
                  oauth: {
                    ...options,
                    scopes:
                      e.target.value.trim() === ""
                        ? []
                        : e.target.value.trim().split(/\s+/),
                  },
                })
              }
            />
          </label>
        </>
      )}
    </fieldset>
  );
}
