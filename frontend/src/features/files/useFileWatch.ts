import { useCallback, useEffect, useRef, useState } from "react";

import { streamFileChanges, type FileWatchFrame } from "./api";
import { filePreviewError } from "./preview-status";

export function useFileWatch(sessionId: string, path: string, enabled: boolean, onFrame: (frame: FileWatchFrame) => void) {
  const callback = useRef(onFrame);
  callback.current = onFrame;
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "failed" | "disabled">("connecting");
  useEffect(() => {
    if (!enabled) { setStatus("disabled"); setError(null); return; }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    window.addEventListener("beforeunload", cancel);
    setStatus("connecting"); setError(null);
    void (async () => {
      try {
        for await (const frame of streamFileChanges(sessionId, path, controller.signal)) {
          if (controller.signal.aborted) return;
          setStatus("connected"); callback.current(frame);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("[files] Watch failed.", { sessionId, path, error });
        setStatus("failed"); setError(filePreviewError(error));
      }
    })();
    return () => { controller.abort(); window.removeEventListener("beforeunload", cancel); };
  }, [sessionId, path, enabled, generation]);
  return { status, error, retry: useCallback(() => setGeneration(current => current + 1), []) };
}
