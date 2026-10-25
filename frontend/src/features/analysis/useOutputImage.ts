import { analysisApi } from "@/features/analysis/api";
import { useEffect, useState } from "react";

export function useOutputImage(
  workspaceId: string,
  outputId: string,
  viewId?: string,
  revision?: number,
) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setError(false);
    void analysisApi
      .preview(workspaceId, outputId, viewId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((reason) => {
        if (!active) return;
        console.error("[analysis] Result preview failed.", {
          outputId,
          reason,
        });
        setError(true);
      });
    return () => {
      active = false;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [workspaceId, outputId, viewId, revision]);
  return { url, error };
}
