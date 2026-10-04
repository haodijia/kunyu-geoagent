import type { ModelProviderType } from "./api";
import type { ProviderCatalogEntry, ProviderCatalogId, ProviderCategory } from "./providers";

interface ProviderCopy {
  readonly name: string;
  readonly description: string;
  readonly badge: string;
}

export const providerCategoryCopy: Record<ProviderCategory, string> = {
  recommended: "推荐",
  api: "模型 API",
  aggregators: "聚合与中转",
  local: "本地模型"
};

export const providerCopy: Record<ProviderCatalogId, ProviderCopy> = {
  openai: { name: "OpenAI", description: "OpenAI 官方 API 接入", badge: "API" },
  deepseek: { name: "DeepSeek", description: "DeepSeek 官方 API 接入", badge: "API" },
  moonshot: { name: "Moonshot", description: "月之暗面官方 API 接入", badge: "API" },
  zai: { name: "Z.AI", description: "智谱 GLM 系列模型官方接入", badge: "API" },
  "zai-coding-plan": { name: "Z.AI Coding Plan", description: "智谱编码套餐 · OpenAI 兼容", badge: "Coding" },
  siliconflow: { name: "SiliconFlow", description: "硅基流动多模型 API", badge: "聚合" },
  openrouter: { name: "OpenRouter", description: "一个密钥接入多家模型供应商", badge: "聚合" },
  groq: { name: "Groq", description: "高速托管开源模型推理", badge: "API" },
  nvidia: { name: "NVIDIA", description: "NVIDIA 托管模型 API", badge: "API" },
  together: { name: "Together AI", description: "托管开源模型 API", badge: "API" },
  deepinfra: { name: "DeepInfra", description: "开源模型托管推理", badge: "API" },
  fireworks: { name: "Fireworks AI", description: "Serverless 开源模型托管", badge: "API" },
  alibaba: { name: "Alibaba Model Studio", description: "阿里云百炼 Qwen 模型接入", badge: "API" },
  xai: { name: "xAI", description: "Grok 系列模型官方接入", badge: "API" },
  mistral: { name: "Mistral", description: "Mistral 官方 API 接入", badge: "API" },
  ollama: { name: "Ollama", description: "本机运行 · 离线可用", badge: "本地" },
  "lm-studio": { name: "LM Studio", description: "本机 LM Studio 模型服务", badge: "本地" },
  localai: { name: "LocalAI", description: "本机 OpenAI 兼容模型服务", badge: "本地" },
  custom: { name: "自定义模型服务", description: "配置服务地址和连接协议", badge: "中转" }
};

export const providerName: Record<ModelProviderType, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  moonshot: "Moonshot",
  zai: "Z.AI",
  siliconflow: "SiliconFlow",
  openrouter: "OpenRouter",
  groq: "Groq",
  nvidia: "NVIDIA",
  together: "Together AI",
  deepinfra: "DeepInfra",
  fireworks: "Fireworks AI",
  alibaba: "Alibaba Model Studio",
  xai: "xAI",
  mistral: "Mistral",
  ollama: "Ollama",
  lm_studio: "LM Studio",
  localai: "LocalAI",
  custom: "自定义模型服务"
};

export function displayForProvider(provider: ProviderCatalogEntry): ProviderCopy {
  return providerCopy[provider.id];
}
