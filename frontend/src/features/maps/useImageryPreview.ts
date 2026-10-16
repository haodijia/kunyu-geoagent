import { useEffect, useRef, useState } from "react";
import type { ImageSource } from "maplibre-gl";
import { zhCN } from "@/locales/zh-CN";
import { imageryApi, type ImageCandidates } from "./imagery-api";
import type { useSessionMap } from "./useSessionMap";

const sourceId = "imagery-preview";
const layerId = "imagery-preview-raster";

export function useImageryPreview(
  map: ReturnType<typeof useSessionMap>,
  sessionId: string,
  candidates: ImageCandidates | undefined,
  imageId: number | null,
  active: boolean,
) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const focused = useRef<string | null>(null);
  const instance = map.getMap();
  const image = candidates?.images.find((item) => item.imageId === imageId);
  const candidateSetId = candidates?.id;
  useEffect(() => {
    setError(null);
    setLoading(false);
    if (!active || image === undefined || candidateSetId === undefined) {
      focused.current = null;
      return;
    }
    if (!map.ready || instance === null) return;
    const ring = image.footprint;
    if (
      ring === null ||
      ring.length !== 5 ||
      ring.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))
    ) {
      setError(zhCN.mapConversation.noFootprint);
      return;
    }
    const coordinates = ring.slice(0, 4).map((point) => [...point]) as [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ];
    const controller = new AbortController();
    let bitmap: ImageBitmap | null = null;
    const remove = () => {
      if (instance.getStyle() !== undefined) {
        if (instance.getLayer(layerId) !== undefined)
          instance.removeLayer(layerId);
        if (instance.getSource(sourceId) !== undefined)
          instance.removeSource(sourceId);
      }
      bitmap?.close();
      bitmap = null;
    };
    setLoading(true);
    void (async () => {
      const blob = await imageryApi.preview(
        sessionId,
        candidateSetId,
        image.imageId,
        controller.signal,
      );
      const decoded = await createImageBitmap(blob);
      if (controller.signal.aborted) {
        decoded.close();
        return;
      }
      bitmap = decoded;
      instance.addSource(sourceId, { type: "image", coordinates });
      const source = instance.getSource<ImageSource>(sourceId);
      if (source === undefined)
        throw new Error("The imagery preview source was not created.");
      source.updateImage({ image: bitmap });
      instance.addLayer(
        {
          id: layerId,
          type: "raster",
          source: sourceId,
          paint: { "raster-opacity": 1, "raster-fade-duration": 0 },
        },
        "imagery-candidates-fill",
      );
      const key = `${candidateSetId}:${image.imageId}`;
      if (focused.current !== key) {
        const bottom = instance.getPadding().bottom;
        if (bottom === undefined)
          throw new Error("Map composer padding is not initialized.");
        instance.fitBounds(
          [
            [
              Math.min(...ring.map(([x]) => x)),
              Math.min(...ring.map(([, y]) => y)),
            ],
            [
              Math.max(...ring.map(([x]) => x)),
              Math.max(...ring.map(([, y]) => y)),
            ],
          ],
          {
            padding: {
              top: 60,
              right: 50,
              bottom: bottom + 30,
              left: Math.min(360, instance.getContainer().clientWidth * 0.42),
            },
            maxZoom: 14,
            duration: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? 0
              : 500,
          },
        );
        focused.current = key;
      }
    })()
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[map] Imagery overlay failed.", {
          imageId: image.imageId,
          error: failure,
        });
        remove();
        setError(zhCN.mapConversation.previewFailed);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      remove();
    };
  }, [instance, map.ready, active, sessionId, candidateSetId, image, revision]);
  return { loading, error, retry: () => setRevision((value) => value + 1) };
}
