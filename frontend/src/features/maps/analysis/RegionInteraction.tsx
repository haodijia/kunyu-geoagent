import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { rasterApi, type RegionGeometry } from "@/features/analysis/raster";
import type { InteractionProps } from "@/features/maps/analysis/PixelInteraction";
import { referenceSelection } from "@/features/maps/analysis/selection-reference";
import {
  useMapDrawing,
  useSelectionOverlay,
} from "@/features/maps/analysis/useMapDrawing";
import { interactionCopy as copy } from "@/locales/zh-CN/map-interactions";

function importedGeometry(value: unknown): RegionGeometry {
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    "crs" in value
  )
    throw new Error(copy.invalidImport);
  if (value.type === "Feature" && "geometry" in value)
    return importedGeometry(value.geometry);
  if (
    (value.type === "Polygon" || value.type === "MultiPolygon") &&
    "coordinates" in value &&
    Array.isArray(value.coordinates)
  )
    return value as RegionGeometry;
  throw new Error(copy.invalidImport);
}
export function RegionInteraction({
  workspaceId,
  sessionId,
  layer,
  outputs,
  map,
}: InteractionProps) {
  const [geometry, setGeometry] = useState<RegionGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const stats = useMutation({
    mutationFn: (value: RegionGeometry) =>
      rasterApi.statistics(workspaceId, layer.output_id!, value),
    onError: (reason) => {
      console.error("[map] Region statistics failed", reason);
      setError(reason.message);
    },
  });
  const complete = useCallback(
    (value: RegionGeometry) => {
      setGeometry(value);
      setSaved(false);
      setError(null);
      stats.reset();
    },
    [stats.reset],
  );
  const instance = map.getMap();
  const scalar =
    outputs.find((output) => output.id === layer.output_id)?.kind ===
    "scalar_raster";
  const drawing = useMapDrawing(instance, map.ready, complete, "rectangle");
  useSelectionOverlay(instance, map.ready, geometry);
  function startDrawing(mode: "rectangle" | "polygon") {
    setGeometry(null);
    setSaved(false);
    setError(null);
    stats.reset();
    drawing.setMode(mode);
  }
  async function reference() {
    if (geometry === null) return;
    setSaving(true);
    setError(null);
    try {
      await referenceSelection(
        workspaceId,
        sessionId,
        copy.area,
        layer,
        geometry,
        outputs,
      );
      setSaved(true);
    } catch (reason) {
      console.error("[map] Referencing region failed", reason);
      setError(reason instanceof Error ? reason.message : copy.failedRequest);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={!map.ready}
          onClick={() => startDrawing("rectangle")}
        >
          {copy.rectangle}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!map.ready}
          onClick={() => startDrawing("polygon")}
        >
          {copy.polygon}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInput.current?.click()}
        >
          {copy.import}
        </Button>
      </div>
      <input
        type="file"
        ref={fileInput}
        className="hidden"
        accept=".json,.geojson"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file === undefined) return;
          if (file.size > 2 * 1024 * 1024) {
            setError(copy.invalidImport);
            return;
          }
          void file
            .text()
            .then((text) => complete(importedGeometry(JSON.parse(text))))
            .catch((reason) => {
              console.error("[map] Region import failed", reason);
              setError(copy.invalidImport);
            });
        }}
      />
      {drawing.mode !== null ? (
        <p role="status">
          {drawing.mode === "rectangle" ? copy.drawRectangle : copy.drawPolygon}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => drawing.setMode(null)}
          >
            {copy.cancel}
          </Button>
        </p>
      ) : (
        geometry === null && (
          <p className="leading-5 text-muted-foreground">{copy.noRegion}</p>
        )
      )}
      {geometry !== null && (
        <div className="flex flex-wrap gap-1">
          {scalar && (
            <Button
              size="sm"
              variant="outline"
              disabled={stats.isPending}
              onClick={() => {
                setError(null);
                stats.mutate(geometry);
              }}
            >
              {copy.statistics}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={saving || saved}
            onClick={() => void reference()}
          >
            {copy.send}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setGeometry(null);
              setSaved(false);
              setError(null);
              stats.reset();
              drawing.setMode(null);
            }}
          >
            {copy.clear}
          </Button>
        </div>
      )}
      {stats.data !== undefined && (
        <div className="space-y-1 rounded bg-muted p-2" role="status">
          <p>
            {copy.selectedPixels}: {stats.data.selected_pixel_count}
          </p>
          <p>
            {copy.validPixels}: {stats.data.valid_pixel_count}
          </p>
          {stats.data.classes.map((value) => (
            <p key={value.value}>
              {value.label}: {(value.area_m2 / 1e6).toFixed(4)} km²
            </p>
          ))}
          {stats.data.mean !== null && (
            <p>
              {copy.min}: {stats.data.minimum?.toPrecision(5)} · {copy.max}:{" "}
              {stats.data.maximum?.toPrecision(5)} · {copy.mean}:{" "}
              {stats.data.mean.toPrecision(5)}
            </p>
          )}
          <p className="leading-5 text-muted-foreground">
            {stats.data.coverage_note}
          </p>
        </div>
      )}
      {saved && (
        <p role="status" className="text-muted-foreground">
          {copy.saved}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
