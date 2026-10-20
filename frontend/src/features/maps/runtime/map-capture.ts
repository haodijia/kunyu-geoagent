import { requestJson } from "@/api/client";
import { zhCN } from "@/locales/zh-CN";
import type { Map } from "maplibre-gl";

type CaptureCode = "MAP_NOT_OPEN" | "MAP_NOT_READY" | "MAP_CAPTURE_FAILED";

export class MapCaptureError extends Error {
  constructor(readonly code: CaptureCode, message: string) {
    super(message);
  }
}

const captures = new globalThis.Map<string, () => Promise<Blob>>();

export function registerMapCapture(sessionId: string, capture: () => Promise<Blob>) {
  if (captures.has(sessionId)) throw new Error("A map capture provider is already mounted for this session.");
  captures.set(sessionId, capture);
  return () => { captures.delete(sessionId); };
}

export async function respondToMapCapture(sessionId: string, requestId: string, signal: AbortSignal) {
  const path = `/api/v1/sessions/${encodeURIComponent(sessionId)}/map/captures/${encodeURIComponent(requestId)}`;
  let image: Blob;
  try {
    const capture = captures.get(sessionId);
    if (capture === undefined) throw new MapCaptureError("MAP_NOT_OPEN", zhCN.map.captureNotOpen);
    image = await capture();
  } catch (error) {
    console.error("[map] Screenshot capture failed.", { sessionId, requestId, error });
    await requestJson(path, {
      method: "POST", signal,
      body: JSON.stringify({
        code: error instanceof MapCaptureError ? error.code : "MAP_CAPTURE_FAILED",
        message: error instanceof Error ? error.message.slice(0, 1000) : zhCN.map.captureFailed,
      }),
    });
    return;
  }
  await requestJson(path, { method: "POST", signal, headers: { "Content-Type": "image/png" }, body: image });
}

export async function captureMapCanvas(map: Map): Promise<Blob> {
  if (!map.loaded() || map.isMoving()) {
    await new Promise<void>((resolve, reject) => {
      const clear = () => {
        clearTimeout(timeout);
        map.off("idle", ready);
        map.off("remove", removed);
      };
      const ready = () => { clear(); resolve(); };
      const removed = () => { clear(); reject(new MapCaptureError("MAP_NOT_OPEN", zhCN.map.captureNotOpen)); };
      const timeout = setTimeout(() => {
        clear();
        reject(new MapCaptureError("MAP_NOT_READY", zhCN.map.captureNotReady));
      }, 10_000);
      map.once("idle", ready);
      map.once("remove", removed);
      map.triggerRepaint();
    });
  }
  // Read immediately after a synchronous render; normal map rendering keeps its default buffer policy.
  map.redraw();
  return new Promise((resolve, reject) => {
    map.getCanvas().toBlob(blob => {
      if (blob === null) reject(new MapCaptureError("MAP_CAPTURE_FAILED", zhCN.map.captureFailed));
      else resolve(blob);
    }, "image/png");
  });
}
