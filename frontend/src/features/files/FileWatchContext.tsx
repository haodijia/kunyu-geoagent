import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ApiError } from "@/api/client";
import { streamFileChanges, type FileWatchFrame } from "./api";
import { filePreviewError } from "./preview-status";

type Status = "connecting" | "connected" | "failed";
export interface WatchUpdate { readonly status: Status; readonly error: string | null; readonly frame?: FileWatchFrame; }
type Listener = (update: WatchUpdate) => void;
interface Target { readonly listeners: Set<Listener>; status: Status; error: string | null; }
interface WatchRegistry {
  readonly sessionId: string;
  readonly subscribe: (path: string, listener: Listener) => () => void;
  readonly retry: (path: string) => void;
}
const FileWatchContext = createContext<WatchRegistry | null>(null);

export function FileWatchProvider({ sessionId, children }: { readonly sessionId: string; readonly children: ReactNode }) {
  const targets = useRef(new Map<string, Target>());
  const [generation, setGeneration] = useState(0);
  const subscribe = useCallback((path: string, listener: Listener) => {
    let target = targets.current.get(path);
    if (target === undefined) {
      target = { listeners: new Set(), status: "connecting", error: null };
      targets.current.set(path, target);
      setGeneration(current => current + 1);
    }
    target.listeners.add(listener);
    listener({ status: target.status, error: target.error });
    return () => {
      target.listeners.delete(listener);
      if (target.listeners.size === 0) {
        targets.current.delete(path);
        setGeneration(current => current + 1);
      }
    };
  }, []);
  const retry = useCallback((path: string) => {
    const target = targets.current.get(path);
    if (target === undefined) return;
    target.status = "connecting"; target.error = null;
    for (const listener of target.listeners) listener({ status: "connecting", error: null });
    setGeneration(current => current + 1);
  }, []);
  useEffect(() => {
    const active = new Map([...targets.current].filter(([, target]) => target.status !== "failed"));
    if (active.size === 0) return;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    window.addEventListener("beforeunload", cancel);
    const deliver = (path: string, update: WatchUpdate) => {
      if (controller.signal.aborted) return;
      const target = active.get(path);
      if (target === undefined || targets.current.get(path) !== target) return;
      target.status = update.status; target.error = update.error;
      for (const listener of target.listeners) listener(update);
    };
    for (const path of active.keys()) deliver(path, { status: "connecting", error: null });
    void (async () => {
      try {
        for await (const event of streamFileChanges(sessionId, [...active.keys()], controller.signal)) {
          if (controller.signal.aborted) return;
          if (event.kind === "error") {
            const error = new ApiError(503, event.message, { error: event });
            console.error("[files] Watch failed.", { sessionId, path: event.path, error });
            deliver(event.path, { status: "failed", error: filePreviewError(error) });
          } else deliver(event.path, { status: "connected", error: null, frame: event });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("[files] Watch stream failed.", { sessionId, error });
        for (const [path, target] of active) {
          if (target.status !== "failed") deliver(path, { status: "failed", error: filePreviewError(error) });
        }
      }
    })();
    return () => { controller.abort(); window.removeEventListener("beforeunload", cancel); };
  }, [sessionId, generation]);
  const value = useMemo(() => ({ sessionId, subscribe, retry }), [sessionId, subscribe, retry]);
  return <FileWatchContext.Provider value={value}>{children}</FileWatchContext.Provider>;
}

export function useFileWatchRegistry(sessionId: string) {
  const registry = useContext(FileWatchContext);
  if (registry === null || registry.sessionId !== sessionId) throw new Error("File watches require their session provider.");
  return registry;
}
