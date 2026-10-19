import { analysisApi } from "@/features/analysis/api";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function useLayerPreview(sessionId: string, layerId: string, enabled = true) {
  const query = useQuery({
    queryKey: ["map-layer-preview", sessionId, layerId],
    queryFn: ({ signal }) => analysisApi.layerPreview(sessionId, layerId, signal),
    staleTime: Infinity,
    enabled,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (query.data === undefined) return;
    const value = URL.createObjectURL(query.data);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [query.data]);
  useEffect(() => {
    if (query.error !== null) console.error("[map] Layer preview failed.", { layerId, error: query.error });
  }, [layerId, query.error]);
  return { url, error: query.isError };
}
