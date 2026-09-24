import { requestJson } from "../../api/client";

export interface HealthResponse {
  readonly status: "healthy";
  readonly api_version: "1";
}

export function getHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/api/v1/system/health");
}
