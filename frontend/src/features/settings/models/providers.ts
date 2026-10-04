import type { MaxTokensField, ModelAuthMode, ModelProtocol, ModelProviderType } from "./api";

export type ProviderCategory = "recommended" | "api" | "aggregators" | "local";
export type ProviderCatalogId =
  | "openai"
  | "deepseek"
  | "moonshot"
  | "zai"
  | "zai-coding-plan"
  | "siliconflow"
  | "openrouter"
  | "groq"
  | "nvidia"
  | "together"
  | "deepinfra"
  | "fireworks"
  | "alibaba"
  | "xai"
  | "mistral"
  | "ollama"
  | "lm-studio"
  | "localai"
  | "custom";

export interface ProviderCatalogEntry {
  readonly id: ProviderCatalogId;
  readonly providerType: ModelProviderType;
  readonly protocol: ModelProtocol;
  readonly category: Exclude<ProviderCategory, "recommended">;
  readonly recommended: boolean;
  readonly baseUrl: string;
  readonly authMode: ModelAuthMode;
  readonly maxTokensField: MaxTokensField;
  readonly includeUsage: boolean;
}

export const providerCatalog = [
  entry("openai", "openai", "api", true, "https://api.openai.com/v1"),
  entry("deepseek", "deepseek", "api", true, "https://api.deepseek.com/anthropic"),
  entry("moonshot", "moonshot", "api", true, "https://api.moonshot.cn/v1"),
  entry("zai", "zai", "api", true, "https://api.z.ai/api/paas/v4"),
  entry("zai-coding-plan", "zai", "api", true, "https://api.z.ai/api/coding/paas/v4"),
  entry("siliconflow", "siliconflow", "aggregators", true, "https://api.siliconflow.com/v1"),
  entry("openrouter", "openrouter", "aggregators", true, "https://openrouter.ai/api/v1"),
  entry("groq", "groq", "api", false, "https://api.groq.com/openai/v1"),
  entry("nvidia", "nvidia", "api", false, "https://integrate.api.nvidia.com/v1"),
  entry("together", "together", "api", false, "https://api.together.xyz/v1"),
  entry("deepinfra", "deepinfra", "api", false, "https://api.deepinfra.com/v1/openai"),
  entry("fireworks", "fireworks", "api", false, "https://api.fireworks.ai/inference/v1"),
  entry("alibaba", "alibaba", "api", false, "https://dashscope.aliyuncs.com/compatible-mode/v1"),
  entry("xai", "xai", "api", false, "https://api.x.ai/v1", "max_completion_tokens"),
  entry("mistral", "mistral", "api", false, "https://api.mistral.ai/v1"),
  entry("ollama", "ollama", "local", true, "http://127.0.0.1:11434/v1", "max_tokens", "none"),
  entry("lm-studio", "lm_studio", "local", false, "http://127.0.0.1:1234/v1", "max_tokens", "none"),
  entry("localai", "localai", "local", false, "http://127.0.0.1:8080/v1", "max_tokens", "none"),
  entry("custom", "custom", "aggregators", true, "")
] as const satisfies readonly ProviderCatalogEntry[];

function entry(
  id: ProviderCatalogId,
  providerType: ModelProviderType,
  category: Exclude<ProviderCategory, "recommended">,
  recommended: boolean,
  baseUrl: string,
  maxTokensField: MaxTokensField = "max_tokens",
  authMode: ModelAuthMode = "api_key"
): ProviderCatalogEntry {
  return {
    id,
    providerType,
    protocol: providerType === "deepseek" ? "deepseek_messages" : "openai_compatible",
    category,
    recommended,
    baseUrl,
    authMode,
    maxTokensField,
    includeUsage: false
  };
}

export function providerById(id: string): ProviderCatalogEntry | undefined {
  return providerCatalog.find((provider) => provider.id === id);
}
