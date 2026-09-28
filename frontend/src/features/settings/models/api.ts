import { requestJson } from "@/api/client";

export type ModelProtocol = "openai_compatible";
export type ModelAuthMode = "api_key" | "none";
export type MaxTokensField = "max_tokens" | "max_completion_tokens";
export type ModelCheckStatus = "unchecked" | "passed" | "failed";
export type CatalogAvailability = "available" | "unavailable";
export type CatalogSource = "fetched" | "manual";
export type CapabilityStatus = "unknown" | "supported" | "unsupported";
export type CapabilitySource = "unknown" | "provider_metadata" | "validation";
export type DiscoveryStatus = "idle" | "pending" | "succeeded" | "failed" | "interrupted";
export type ManagementStatus = "ready";

export interface ModelCheck {
  readonly status: ModelCheckStatus;
  readonly checked_at: string | null;
  readonly error_code: string | null;
}

export interface ModelCatalogEntry {
  readonly model_id: string;
  readonly display_name: string | null;
  readonly sources: CatalogSource[];
  readonly revision: number;
  readonly availability: CatalogAvailability;
  readonly enabled: boolean;
  readonly checks: {
    readonly text: ModelCheck;
    readonly tools: ModelCheck;
  };
  readonly tool_capability: CapabilityStatus;
  readonly tool_capability_source: CapabilitySource;
  readonly reasoning_efforts: string[];
  readonly reasoning_source: CapabilitySource;
  readonly discovered_at: string | null;
}

export interface ModelConnection {
  readonly id: string;
  readonly display_name: string;
  readonly protocol: ModelProtocol;
  readonly base_url: string;
  readonly auth_mode: ModelAuthMode;
  readonly enabled: boolean;
  readonly is_default: boolean;
  readonly revision: number;
  readonly default_model_id: string | null;
  readonly enabled_model_ids: string[];
  readonly max_tokens_field: MaxTokensField;
  readonly include_usage: boolean;
  readonly credential: {
    readonly status: "missing" | "ready";
    readonly configured: boolean;
    readonly updated_at: string | null;
  };
  readonly management_status: ManagementStatus;
  readonly discovery: {
    readonly status: DiscoveryStatus;
    readonly generation: number;
    readonly last_success_at: string | null;
    readonly error_code: string | null;
  };
  readonly entries: ModelCatalogEntry[];
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateModelConnectionInput {
  readonly display_name: string;
  readonly protocol: ModelProtocol;
  readonly base_url: string;
  readonly auth_mode: ModelAuthMode;
  readonly max_tokens_field: MaxTokensField;
  readonly include_usage: boolean;
}

export type UpdateModelConnectionInput = Partial<
  Pick<
    ModelConnection,
    | "display_name"
    | "base_url"
    | "auth_mode"
    | "enabled"
    | "enabled_model_ids"
    | "default_model_id"
    | "max_tokens_field"
    | "include_usage"
  >
> & { readonly is_default?: false };

export interface ModelTestResult {
  readonly model_id: string;
  readonly revision: number;
  readonly status: ModelCheckStatus;
  readonly checks: {
    readonly text: ModelCheck;
    readonly tools: ModelCheck;
  };
  readonly latency_ms: number;
  readonly error_code: string | null;
}

const pathFor = (connectionId: string) =>
  `/api/v1/model-connections/${encodeURIComponent(connectionId)}`;

export const modelConnectionsApi = {
  list: () => requestJson<ModelConnection[]>("/api/v1/model-connections"),
  get: (connectionId: string) =>
    requestJson<ModelConnection>(pathFor(connectionId)),
  create: (input: CreateModelConnectionInput) =>
    requestJson<ModelConnection>("/api/v1/model-connections", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  update: (connectionId: string, input: UpdateModelConnectionInput) =>
    requestJson<ModelConnection>(pathFor(connectionId), {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  delete: (connectionId: string) =>
    requestJson<void>(pathFor(connectionId), { method: "DELETE" }),
  setDefault: (connectionId: string) =>
    requestJson<ModelConnection>(`${pathFor(connectionId)}/default`, {
      method: "PUT",
      body: "{}"
    }),
  setCredential: (connectionId: string, apiKey: string) =>
    requestJson<ModelConnection>(`${pathFor(connectionId)}/credential`, {
      method: "PUT",
      body: JSON.stringify({ api_key: apiKey })
    }),
  clearCredential: (connectionId: string) =>
    requestJson<ModelConnection>(`${pathFor(connectionId)}/credential`, {
      method: "DELETE"
    }),
  discover: (connectionId: string) =>
    requestJson(`${pathFor(connectionId)}/discover-models`, {
      method: "POST",
      body: "{}"
    }),
  addManualModel: (connectionId: string, modelId: string) =>
    requestJson<ModelCatalogEntry>(`${pathFor(connectionId)}/manual-models`, {
      method: "POST",
      body: JSON.stringify({ model_id: modelId })
    }),
  deleteManualModel: (connectionId: string, modelId: string) =>
    requestJson<void>(
      `${pathFor(connectionId)}/manual-models?${new URLSearchParams({ model_id: modelId })}`,
      { method: "DELETE" }
    ),
  test: (connectionId: string, modelId: string, mode: "text" | "tools") =>
    requestJson<ModelTestResult>(`${pathFor(connectionId)}/test`, {
      method: "POST",
      body: JSON.stringify({ model_id: modelId, mode })
    })
};
