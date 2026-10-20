import { analysisApi, analysisKeys } from "@/features/analysis/api";
import { requestJson } from "@/api/client";
import type { WorkspaceReference } from "@/features/workspaces/references";
import { zhCN } from "@/locales/zh-CN";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

export function useWorkspaceReferences(workspaceId: string, sessionId: string, query: string | null) {
  const enabled = query !== null;
  const resources = useQuery({
    queryKey: ["workspace-references", workspaceId, query],
    queryFn: ({ signal }) => requestJson<(Omit<WorkspaceReference, "target"> & { file_path: string })[]>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/references?${new URLSearchParams({ query: query! })}`, { signal }),
    enabled,
  });
  const layers = useQuery({ queryKey: analysisKeys.layers(sessionId), queryFn: () => analysisApi.layers(sessionId), enabled, staleTime: 5000 });
  const error = resources.error ?? layers.error;
  useEffect(() => {
    if (error !== null) console.error("[references] Workspace resources could not be loaded.", { workspaceId, error });
  }, [workspaceId, error]);
  const items: WorkspaceReference[] = resources.data === undefined ? [] : resources.data.map(item => ({
    ...item,
    target: item.file_path.split("/").map(part => encodeURIComponent(part)).join("/"),
  }));
  if (layers.data !== undefined) for (const layer of layers.data) {
    if (layer.image !== null) items.push({ name: layer.title, detail: `image_id: ${layer.image.image_id}`, kind: "image", target: `oge-image:${layer.image.image_id}` });
  }
  const unique = [...new Map(items.map(item => [item.target, item])).values()];
  const needle = query === null ? "" : query.toLocaleLowerCase();
  return {
    items: unique.filter(item => `${item.name} ${item.detail}`.toLocaleLowerCase().includes(needle)).slice(0, 50),
    pending: resources.isPending || layers.isPending,
    error: error === null ? null : zhCN.conversation.references.loadFailed,
    retry: () => { void resources.refetch(); void layers.refetch(); },
  };
}
