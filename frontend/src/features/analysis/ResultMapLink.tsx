import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { useAppUiStore } from "@/app/store";
import { analysisApi, analysisKeys } from "./api";
import { sessionMapPath } from "@/features/sessions/routes";

/** Resolve result file citations within the current workspace before changing the map. */
export function ResultMapLink({
  path,
  children,
}: {
  readonly path: string;
  readonly children: ReactNode;
}) {
  const { workspaceId, sessionId } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const outputs = useQuery({
    queryKey: analysisKeys.outputs(workspaceId ?? ""),
    queryFn: () => analysisApi.outputs(workspaceId!),
    enabled: workspaceId !== undefined && sessionId !== undefined,
  });
  const output = outputs.data?.find(
    (item) =>
      item.file_path.split("/").map(encodeURIComponent).join("/") === path ||
      item.file_path === path,
  );
  const open = useMutation({
    mutationFn: async () => {
      if (
        output === undefined ||
        sessionId === undefined ||
        workspaceId === undefined
      )
        return;
      const layer = await analysisApi.addLayer(
        sessionId,
        output.id,
        output.metadata.default_view,
      );
      const store = useAppUiStore.getState();
      store.initializeMapContext(sessionId, workspaceId);
      store.inspectMapLayer(sessionId, layer.id);
      store.focusMap(sessionId, output.bounds);
      store.setMapComparison(sessionId, null);
      await client.invalidateQueries({
        queryKey: analysisKeys.layers(sessionId),
      });
      void navigate(sessionMapPath(workspaceId, sessionId));
    },
    onError: (error) =>
      console.error("[results] Citation navigation failed", error),
  });
  if (output === undefined) return <span>{children}</span>;
  return (
    <span>
      <button
        type="button"
        className="text-primary underline underline-offset-2 disabled:opacity-50"
        disabled={open.isPending}
        onClick={() => open.mutate()}
      >
        {children}
      </button>
      {open.isError && (
        <span role="alert" className="ms-2 text-xs text-destructive">
          {open.error.message}
        </span>
      )}
    </span>
  );
}
