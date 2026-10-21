import { useMutation } from "@tanstack/react-query";
import type { MapMouseEvent } from "maplibre-gl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AnalysisOutput, MapLayer } from "@/features/analysis/api";
import {
  assessmentApi,
  rasterCategories,
  type RasterSample,
  type StudyGeometry,
} from "@/features/assessments/api";
import { selectClass } from "@/features/assessments/AssessmentForm";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { assessmentCopy as copy } from "@/locales/zh-CN/assessments";

export function RasterInspector({
  map,
  workspaceId,
  outputs,
  layers,
  active,
  region,
  selectedRegion,
  draftRegion,
  selectedOutput,
  drawing,
  onStopDrawing,
  onClearRegion,
  pair,
  onPair,
}: {
  readonly map: ReturnType<typeof useSessionMap>;
  readonly workspaceId: string;
  readonly outputs: readonly AnalysisOutput[];
  readonly layers: readonly MapLayer[];
  readonly active: boolean;
  readonly region: StudyGeometry | null;
  readonly selectedRegion: boolean;
  readonly draftRegion: boolean;
  readonly selectedOutput: string | null;
  readonly drawing: boolean;
  readonly onStopDrawing: () => void;
  readonly onClearRegion: () => void;
  readonly pair: readonly [string, string] | null;
  readonly onPair: (pair: readonly [string, string] | null) => void;
}) {
  const instance = map.getMap();
  const [outputId, setOutputId] = useState("");
  const [sampling, setSampling] = useState(false);
  const [sample, setSample] = useState<RasterSample | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const statistics = useMutation({
    mutationFn: (geometry: StudyGeometry) =>
      assessmentApi.statistics(workspaceId, outputId, geometry),
    onError: (reason) => {
      console.error("[map] Region statistics failed", reason);
      setError(reason.message);
    },
  });
  useEffect(() => {
    if (selectedOutput !== null) {
      setOutputId(selectedOutput);
      setSample(null);
      statistics.reset();
    }
  }, [selectedOutput]);
  useEffect(() => {
    if (!active || selectedRegion) setSampling(false);
  }, [active, selectedRegion]);
  useEffect(() => {
    statistics.reset();
  }, [region]);
  useEffect(() => {
    if (
      instance === null ||
      !map.ready ||
      !active ||
      !sampling ||
      outputId === "" ||
      drawing
    )
      return;
    let pending: AbortController | null = null;
    const cursor = instance.getCanvas().style.cursor;
    instance.getCanvas().style.cursor = "crosshair";
    const click = (event: MapMouseEvent) => {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      void assessmentApi
        .sample(
          workspaceId,
          outputId,
          event.lngLat.lng,
          event.lngLat.lat,
          controller.signal,
        )
        .then((value) => {
          if (!controller.signal.aborted) {
            setSample(value);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            console.error("[map] Raster sample failed", reason);
            setError(
              reason instanceof Error ? reason.message : copy.failedRequest,
            );
          }
        });
    };
    instance.on("click", click);
    return () => {
      pending?.abort();
      instance.off("click", click);
      instance.getCanvas().style.cursor = cursor;
    };
  }, [instance, map.ready, active, sampling, outputId, drawing, workspaceId]);
  const categories = rasterCategories(
    outputs.find((output) => output.id === outputId)?.metadata ?? {},
  );
  return (
    <div className="space-y-3">
      {error !== null && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <label className="block space-y-1 text-xs">
        {copy.output}
        <select
          className={selectClass}
          value={outputId}
          onChange={(event) => {
            setOutputId(event.target.value);
            setSample(null);
            setError(null);
            statistics.reset();
          }}
        >
          <option value="">{copy.select}</option>
          {outputs.map((output) => (
            <option key={output.id} value={output.id}>
              {output.title}
            </option>
          ))}
        </select>
      </label>
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {categories.map((entry) => (
            <span key={entry.value} className="flex items-center gap-1">
              <span
                className="size-2 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              {entry.label}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        {copy.sampleHint}
      </p>
      <Button
        size="sm"
        variant={sampling ? "secondary" : "outline"}
        disabled={outputId === "" || !map.ready}
        onClick={() => {
          onStopDrawing();
          setSampling((value) => !value);
        }}
      >
        {sampling ? copy.stopSample : copy.sample}
      </Button>
      {sample !== null && (
        <div
          className="space-y-1 rounded-md bg-muted p-2 text-xs"
          role="status"
        >
          {!sample.inside
            ? copy.outside
            : sample.values.map((value, index) => (
                <p key={index}>
                  {sample.bands[index] ?? `${index + 1}`}:{" "}
                  {value === null
                    ? "—"
                    : `${value.toPrecision(6)} ${sample.categories?.find((item) => item.value === value)?.label ?? ""}`}
                </p>
              ))}
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={outputId === "" || region === null || statistics.isPending}
        onClick={() => {
          if (region !== null) statistics.mutate(region);
        }}
      >
        {selectedRegion
          ? copy.selectedStatistics
          : draftRegion
            ? copy.draftStatistics
            : copy.statistics}
      </Button>
      {selectedRegion && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onClearRegion();
            statistics.reset();
          }}
        >
          {copy.clearSelection}
        </Button>
      )}
      {region === null && (
        <p className="text-xs text-muted-foreground">{copy.noRegion}</p>
      )}
      {statistics.data !== undefined && (
        <div
          className="space-y-1 rounded-md bg-muted p-2 text-xs"
          role="status"
        >
          <p>
            {copy.selectedPixels}: {statistics.data.selected_pixel_count}
          </p>
          <p>
            {copy.validPixels}: {statistics.data.valid_pixel_count}
          </p>
          {statistics.data.classes.map((item) => (
            <p key={item.value}>
              {item.label}: {(item.area_m2 / 1e6).toFixed(4)} km²
            </p>
          ))}
          {statistics.data.mean !== null && (
            <p>
              {copy.min}: {statistics.data.minimum?.toPrecision(5)} · {copy.max}
              : {statistics.data.maximum?.toPrecision(5)} · {copy.mean}:{" "}
              {statistics.data.mean.toPrecision(5)}
            </p>
          )}
          <p className="leading-5 text-muted-foreground">
            {statistics.data.coverage_note}
          </p>
        </div>
      )}
      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-medium">{copy.swipe}</p>
        <p className="text-xs text-muted-foreground">{copy.swipeHint}</p>
        {(
          [
            [copy.left, left, setLeft],
            [copy.right, right, setRight],
          ] as const
        ).map(([label, value, setter]) => (
          <label className="block space-y-1 text-xs" key={label}>
            {label}
            <select
              className={selectClass}
              value={value}
              onChange={(event) => {
                onPair(null);
                setter(event.target.value);
              }}
            >
              <option value="">{copy.select}</option>
              {layers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.title}
                </option>
              ))}
            </select>
          </label>
        ))}
        <Button
          size="sm"
          variant="outline"
          disabled={left === "" || right === "" || left === right || !map.ready}
          onClick={() => onPair(pair === null ? [left, right] : null)}
        >
          {pair === null ? copy.swipeStart : copy.swipeStop}
        </Button>
      </div>
    </div>
  );
}
