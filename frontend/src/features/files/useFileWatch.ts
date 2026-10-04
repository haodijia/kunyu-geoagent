import { useCallback, useEffect, useRef, useState } from "react";

import { type FileWatchFrame } from "./api";
import { useFileWatchRegistry, type WatchUpdate } from "./FileWatchContext";

export function useFileWatch(sessionId: string, path: string, enabled: boolean, onFrame: (frame: FileWatchFrame) => void) {
  const callback = useRef(onFrame);
  callback.current = onFrame;
  const registry = useFileWatchRegistry(sessionId);
  const [state, setState] = useState<WatchUpdate>({ status: "connecting", error: null });
  useEffect(() => {
    if (!enabled) return;
    return registry.subscribe(path, update => {
      setState({ status: update.status, error: update.error });
      if (update.frame !== undefined) callback.current(update.frame);
    });
  }, [registry, path, enabled]);
  const retry = useCallback(() => registry.retry(path), [registry, path]);
  return { status: enabled ? state.status : "disabled", error: enabled ? state.error : null, retry };
}
