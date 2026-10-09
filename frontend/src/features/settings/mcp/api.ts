import { requestJson } from "@/api/client";

export interface McpOAuthOptions {
  readonly client_id: string | null;
  readonly client_metadata_url: string | null;
  readonly callback_port: number;
  readonly scopes: readonly string[];
}
export interface McpOAuthFlow {
  readonly id: string;
  readonly status:
    "preparing" | "waiting" | "authorized" | "cancelled" | "failed";
  readonly authorization_url: string | null;
  readonly error_code: string | null;
}
export interface McpConfig {
  readonly name: string;
  readonly transport: "stdio" | "streamable-http";
  readonly auth_mode: "headers" | "oauth";
  readonly oauth: McpOAuthOptions | null;
  readonly url: string | null;
  readonly command: string | null;
  readonly args: readonly string[];
  readonly cwd: string | null;
  readonly enabled: boolean;
  readonly tool_timeout_ms: number;
  readonly read_only_tools: readonly string[];
  readonly reconnect: {
    readonly enabled: boolean;
    readonly initial_delay_ms: number;
    readonly max_delay_ms: number;
    readonly max_attempts: number;
  };
}
export interface McpTool {
  readonly name: string;
  readonly public_name: string;
  readonly description?: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly annotations?: { readonly readOnlyHint?: boolean };
}
export interface McpServer {
  readonly config: McpConfig;
  readonly revision: number;
  readonly catalog_revision: number;
  readonly catalog: {
    readonly tools: readonly McpTool[];
    readonly instructions: string | null;
    readonly capabilities: Readonly<Record<string, unknown>>;
  } | null;
  readonly secret_keys: readonly string[];
  readonly updated_at: string;
  readonly status:
    | "disconnected"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "failed"
    | "login_required";
  readonly auth: {
    readonly authenticated: boolean;
    readonly in_flight: boolean;
    readonly flow: McpOAuthFlow | null;
  };
  readonly error_code: string | null;
  readonly attempt: number;
}
const path = (name: string) =>
  `/api/v1/mcp-servers/${encodeURIComponent(name)}`;
export const mcpApi = {
  login: (name: string, revision: number) =>
    requestJson<McpOAuthFlow>(`${path(name)}/oauth/login`, {
      method: "POST",
      body: JSON.stringify({ expected_revision: revision }),
    }),
  cancelLogin: (name: string, flowId: string) =>
    requestJson<McpServer>(`${path(name)}/oauth/cancel`, {
      method: "POST",
      body: JSON.stringify({ flow_id: flowId }),
    }),
  logout: (name: string, revision: number) =>
    requestJson<McpServer>(`${path(name)}/oauth/logout`, {
      method: "POST",
      body: JSON.stringify({ expected_revision: revision }),
    }),
  list: () => requestJson<readonly McpServer[]>("/api/v1/mcp-servers"),
  create: (config: McpConfig) =>
    requestJson<McpServer>("/api/v1/mcp-servers", {
      method: "POST",
      body: JSON.stringify(config),
    }),
  update: (config: McpConfig, expectedRevision: number) =>
    requestJson<McpServer>(path(config.name), {
      method: "PUT",
      body: JSON.stringify({ config, expected_revision: expectedRevision }),
    }),
  reconnect: (name: string) =>
    requestJson<McpServer>(`${path(name)}/reconnect`, {
      method: "POST",
      body: "{}",
    }),
  remove: (name: string) => requestJson<void>(path(name), { method: "DELETE" }),
  secrets: (
    name: string,
    transport: McpConfig["transport"],
    values: Readonly<Record<string, string>>,
    expectedRevision: number,
  ) =>
    requestJson<McpServer>(`${path(name)}/secrets`, {
      method: "PUT",
      body: JSON.stringify({
        secrets:
          transport === "stdio"
            ? { env: values, headers: {} }
            : { headers: values, env: {} },
        expected_revision: expectedRevision,
      }),
    }),
};
