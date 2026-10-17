import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Polygon } from "geojson";
import {
  analysisKeys,
  type MapState,
  type MapLayer,
} from "@/features/analysis/api";
import { imageryApi, type ImageCandidates } from "./imagery-api";
import type { useSessionMap } from "./useSessionMap";

const sourceId = "imagery-candidates";
const fillId = "imagery-candidates-fill";
const lineId = "imagery-candidates-line";

export function useImageryMap(
  map: ReturnType<typeof useSessionMap>,
  state: MapState,
  candidates: ImageCandidates | undefined,
  preview: number | null,
  onPreview: (id: number) => void,
  layers: readonly MapLayer[],
  candidatesFailed: boolean,
) {
  const client = useQueryClient();
  const processed = useRef<string | null>(null);
  const positioned = useRef<string | null>(null);
  const lastInteraction = useRef(0);
  const [pendingFocus, setPendingFocus] = useState(false);
  const [receiptError, setReceiptError] = useState(false);
  const [renderRevision, setRenderRevision] = useState(0);
  const instance = map.getMap();
  const presentation = state.presentation;
  const candidateError =
    presentation?.target === "candidates" && candidatesFailed;
  useEffect(() => {
    processed.current = null;
    positioned.current = null;
  }, [instance]);
  useEffect(() => {
    if (!map.ready || instance === null) return;
    const interact = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent !== undefined)
        lastInteraction.current = Date.now();
    };
    instance.on("dragstart", interact);
    instance.on("zoomstart", interact);
    const idle = () => setRenderRevision((value) => value + 1);
    instance.on("idle", idle);
    return () => {
      instance.off("dragstart", interact);
      instance.off("zoomstart", interact);
      instance.off("idle", idle);
    };
  }, [instance, map.ready]);

  useEffect(() => {
    if (!map.ready || instance === null) return;
    const active =
      presentation?.target === "candidates" && candidates !== undefined;
    if (!active) {
      for (const id of [lineId, fillId])
        if (instance.getLayer(id) !== undefined) instance.removeLayer(id);
      if (instance.getSource(sourceId) !== undefined)
        instance.removeSource(sourceId);
      return;
    }
    const data: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: candidates.images.flatMap((image, index) =>
        image.footprint === null
          ? []
          : [
              {
                type: "Feature" as const,
                properties: { id: image.imageId, number: index + 1 },
                geometry: {
                  type: "Polygon" as const,
                  coordinates: [image.footprint.map((point) => [...point])],
                },
              },
            ],
      ),
    };
    const source = instance.getSource<GeoJSONSource>(sourceId);
    if (source === undefined)
      instance.addSource(sourceId, { type: "geojson", data });
    else source.setData(data);
    const selected = preview;
    if (instance.getLayer(fillId) === undefined)
      instance.addLayer({ id: fillId, type: "fill", source: sourceId });
    if (instance.getLayer(lineId) === undefined)
      instance.addLayer({ id: lineId, type: "line", source: sourceId });
    instance.setPaintProperty(fillId, "fill-color", "#a78bf5");
    instance.setPaintProperty(fillId, "fill-opacity", [
      "case",
      ["==", ["get", "id"], selected ?? -1],
      0.04,
      0.03,
    ]);
    instance.setPaintProperty(lineId, "line-color", [
      "case",
      ["==", ["get", "id"], selected ?? -1],
      "#a78bf5",
      "#b7bfd0",
    ]);
    instance.setPaintProperty(lineId, "line-width", [
      "case",
      ["==", ["get", "id"], selected ?? -1],
      2.5,
      1,
    ]);
    const click = (event: MapLayerMouseEvent) => {
      const id: unknown = event.features?.[0]?.properties?.id;
      if (typeof id === "number") onPreview(id);
    };
    instance.on("click", fillId, click);
    return () => {
      instance.off("click", fillId, click);
    };
  }, [
    instance,
    map.ready,
    candidates,
    presentation?.target,
    preview,
    onPreview,
  ]);

  const focus = () => {
    if (
      instance === null ||
      presentation?.bounds === null ||
      presentation === null
    )
      return;
    const [west, south, east, north] = presentation.bounds;
    map.focusBounds(
      [
        [west, south],
        [east, north],
      ],
    );
    setPendingFocus(false);
  };

  useEffect(() => {
    if (
      !map.ready ||
      instance === null ||
      presentation === null ||
      presentation.status === "applied" ||
      map.failed ||
      candidateError ||
      processed.current === presentation.request_id
    )
      return;
    if (presentation.target === "candidates" && candidates === undefined)
      return;
    if (!instance.areTilesLoaded()) return;
    if (
      presentation.target === "candidates" &&
      !instance.isSourceLoaded(sourceId)
    )
      return;
    if (presentation.target === "output") {
      const layer = layers.find(
        (layer) => layer.output_id === presentation.reference_id,
      );
      if (
        layer === undefined ||
        instance.getLayer(layer.id) === undefined ||
        !instance.isSourceLoaded(layer.id)
      )
        return;
    }
    if (
      presentation.focus &&
      presentation.bounds !== null &&
      positioned.current !== presentation.request_id
    ) {
      positioned.current = presentation.request_id;
      if (
        instance.isMoving() ||
        Date.now() - lastInteraction.current < 3000 ||
        document.activeElement?.matches(
          "textarea, input, [contenteditable=true]",
        )
      )
        setPendingFocus(true);
      else focus();
    }
    if (instance.isMoving() || !instance.areTilesLoaded()) return;
    processed.current = presentation.request_id;
    if (!presentation.focus) setPendingFocus(false);
    setReceiptError(false);
    let active = true;
    void imageryApi
      .receipt(state.session_id, presentation.request_id, "applied", null)
      .then((value) => {
        if (active)
          client.setQueryData<MapState>(
            analysisKeys.map(state.session_id),
            (current) =>
              current === undefined || current.revision < value.revision
                ? value
                : current,
          );
      })
      .catch((error) => {
        console.error("[map] Presentation receipt failed.", error);
        if (active) {
          processed.current = null;
          setReceiptError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [
    instance,
    map.ready,
    presentation,
    candidates,
    state.session_id,
    client,
    layers,
    renderRevision,
    map.failed,
    candidateError,
  ]);
  useEffect(() => {
    if (
      presentation === null ||
      presentation.status === "failed" ||
      (!map.failed && !candidateError)
    )
      return;
    processed.current = null;
    void imageryApi
      .receipt(
        state.session_id,
        presentation.request_id,
        "failed",
        candidateError
          ? "Image candidates could not be loaded."
          : "Map resources could not be loaded.",
      )
      .then((value) => {
        client.setQueryData<MapState>(
          analysisKeys.map(state.session_id),
          (current) =>
            current === undefined || current.revision < value.revision
              ? value
              : current,
        );
      })
      .catch((error) => {
        console.error(
          "[map] Failed presentation receipt could not be saved.",
          error,
        );
        setReceiptError(true);
      });
  }, [presentation, map.failed, candidateError, state.session_id, client]);
  return {
    pendingFocus,
    focus,
    receiptError,
    retryReceipt: () => {
      processed.current = null;
      setReceiptError(false);
      void client.invalidateQueries({
        queryKey: analysisKeys.map(state.session_id),
      });
    },
  };
}
