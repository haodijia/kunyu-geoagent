import { ApiError } from "@/api/client";
import { zhCN } from "@/locales/zh-CN";
const content = zhCN.mcp;
export const mcpQueryKey = ["mcp-servers"] as const;
export function mcpError(error: unknown): string {
  if (error instanceof ApiError && error.code === "MCP_NAME_EXISTS")
    return content.nameExists;
  if (error instanceof ApiError && error.code === "MCP_CONFIG_CHANGED")
    return content.changed;
  if (error instanceof ApiError && error.code === "MCP_BUSY")
    return content.busy;
  return error instanceof Error ? error.message : content.requestFailed;
}
