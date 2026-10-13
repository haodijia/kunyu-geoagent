import { useEffect, useState } from "react";
import { analysisApi } from "./api";

export function useOutputImage(sessionId: string, outputId: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setError(false);
    void analysisApi
      .preview(sessionId, outputId)
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
  }, [sessionId, outputId]);
  return { url, error };
}
