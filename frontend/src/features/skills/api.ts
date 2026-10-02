import { requestJson } from "@/api/client";

export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly path: string;
  readonly resource_base: string;
  readonly model_invocable: boolean;
  readonly user_invocable: boolean;
  readonly editable: boolean;
}

export interface SkillDetail extends Skill {
  readonly content: string;
  readonly raw: string;
}

export const skillQueryKeys = {
  all: ["skills"] as const,
  catalog: ["skills", "catalog"] as const,
  detail: (name: string) => ["skills", "detail", name] as const,
};

export const skillsApi = {
  list: () => requestJson<{ directory: string; skills: Skill[] }>("/api/v1/skills"),
  detail: (name: string) => requestJson<SkillDetail>(`/api/v1/skills/${encodeURIComponent(name)}`),
  save: (name: string, content: string, create: boolean) => requestJson<Skill>(
    create ? "/api/v1/skills" : `/api/v1/skills/${encodeURIComponent(name)}`,
    { method: create ? "POST" : "PUT", body: JSON.stringify(create ? { name, content } : { content }) },
  ),
  import: (path: string) => requestJson<Skill>("/api/v1/skills/import", {
    method: "POST", body: JSON.stringify({ path }),
  }),
  delete: (name: string) => requestJson<void>(`/api/v1/skills/${encodeURIComponent(name)}`, { method: "DELETE" }),
};
