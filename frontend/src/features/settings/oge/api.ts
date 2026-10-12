import { requestJson } from "@/api/client";

export interface OgeAccountStatus {
  readonly state: "signed_out" | "signed_in" | "expired";
  readonly base_url: string;
  readonly username: string | null;
  readonly expires_at: number | null;
  readonly updated_at: string | null;
}

export interface OgeLoginInput {
  readonly base_url: string;
  readonly username: string;
  readonly password: string;
}

export const ogeAccountQueryKey = ["oge-account"] as const;
const path = "/api/v1/oge/account";

export const ogeAccountApi = {
  status: () => requestJson<OgeAccountStatus>(path),
  login: (input: OgeLoginInput) => requestJson<OgeAccountStatus>(`${path}/login`, {
    method: "POST",
    body: JSON.stringify(input)
  }),
  logout: () => requestJson<OgeAccountStatus>(path, { method: "DELETE" })
};
