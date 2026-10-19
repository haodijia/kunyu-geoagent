import { analysisApi, analysisKeys } from "@/features/analysis/api";
import { searchWorkspaceFiles } from "@/features/workspaces/files/files-api";
import type { WorkspaceReference } from "@/features/workspaces/references";
import { zhCN } from "@/locales/zh-CN";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

export function useWorkspaceReferences(workspaceId: string, sessionId: string, query: string | null) {
  const enabled = query !== null;
  const files = useQuery({
    queryKey: ["workspace-files", workspaceId, query],
    queryFn: ({ signal }) => searchWorkspaceFiles(workspaceId, query!, signal),
    enabled,
  });
  const outputs = useQuery({ queryKey: analysisKeys.outputs(workspaceId), queryFn: () => analysisApi.outputs(workspaceId), enabled, staleTime: 5000 });
  const layers = useQuery({ queryKey: analysisKeys.layers(sessionId), queryFn: () => analysisApi.layers(sessionId), enabled, staleTime: 5000 });
  const error = files.error ?? outputs.error ?? layers.error;
  useEffect(() => {
    if (error !== null) console.error("[references] Workspace resources could not be loaded.", { workspaceId, error });
  }, [workspaceId, error]);
  const items: WorkspaceReference[] = [];
  if (files.data !== undefined) for (const file of files.data) items.push({
    name: file.name, detail: file.file_path, kind: file.kind,
    target: file.file_path.split("/").map(part => encodeURIComponent(part)).join("/"),
  });
  if (outputs.data !== undefined) for (const output of outputs.data) items.push({
    name: output.title, detail: `${output.id} · ${output.source_session_title}`, kind: "result", target: `analysis-output:${output.id}`,
  });
  if (layers.data !== undefined) for (const layer of layers.data) {
    if (layer.image !== null) items.push({ name: layer.title, detail: `image_id: ${layer.image.image_id}`, kind: "image", target: `oge-image:${layer.image.image_id}` });
  }
  const unique = [...new Map(items.map(item => [item.target, item])).values()];
  const needle = query === null ? "" : query.toLocaleLowerCase();
  return {
    items: unique.filter(item => `${item.name} ${item.detail}`.toLocaleLowerCase().includes(needle)).slice(0, 50),
    pending: files.isPending || outputs.isPending || layers.isPending,
    error: error === null ? null : zhCN.conversation.references.loadFailed,
    retry: () => { void files.refetch(); void outputs.refetch(); void layers.refetch(); },
  };
}
