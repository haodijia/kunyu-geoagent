import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  assessmentApi,
  assessmentKeys,
  type StudyArea,
  type StudyGeometry,
} from "@/features/assessments/api";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { assessmentCopy as copy } from "@/locales/zh-CN/assessments";

function importedGeometry(value: unknown): StudyGeometry {
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
    value.type === "FeatureCollection" &&
    "features" in value &&
    Array.isArray(value.features)
  ) {
    const geometries = value.features.map(importedGeometry);
    if (geometries.length === 0) throw new Error(copy.invalidImport);
    return {
      type: "MultiPolygon",
      coordinates: geometries.flatMap((item) =>
        item.type === "Polygon" ? [item.coordinates] : item.coordinates,
      ),
    };
  }
  if (
    (value.type === "Polygon" || value.type === "MultiPolygon") &&
    "coordinates" in value &&
    Array.isArray(value.coordinates)
  )
    return value as StudyGeometry;
  throw new Error(copy.invalidImport);
}

export function StudyAreaEditor({
  map,
  workspaceId,
  area,
  draft,
  disabled,
  mode,
  onMode,
  onSaved,
}: {
  readonly map: ReturnType<typeof useSessionMap>;
  readonly workspaceId: string;
  readonly area: StudyArea | null;
  readonly draft: StudyGeometry | null;
  readonly disabled: boolean;
  readonly mode: "rectangle" | "polygon" | null;
  readonly onMode: (mode: "rectangle" | "polygon" | null) => void;
  readonly onSaved: () => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const save = useMutation({
    mutationFn: (geometry: StudyGeometry) =>
      assessmentApi.saveArea(workspaceId, {
        name: name.trim() || area?.name || copy.area,
        geometry,
        expected_revision: area?.revision ?? 0,
      }),
    onSuccess: (value) => {
      client.setQueryData(assessmentKeys.area(workspaceId), value);
      setError(null);
      onSaved();
    },
    onError: (reason) => {
      console.error("[map] Save study area failed", reason);
      setError(reason.message);
    },
  });
  return (
    <div className="space-y-3">
      {error !== null && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        {area
          ? `${area.name} · ${copy.revision} ${area.revision} · ${(area.area_m2 / 1e6).toFixed(3)} ${copy.areaUnit}`
          : copy.missingArea}
      </p>
      <Input
        aria-label={copy.name}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={area?.name ?? copy.name}
        maxLength={120}
      />
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={!map.ready || save.isPending}
          onClick={() => onMode("rectangle")}
        >
          {copy.rectangle}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!map.ready || save.isPending}
          onClick={() => onMode("polygon")}
        >
          {copy.polygon}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={save.isPending || disabled}
          onClick={() => fileInput.current?.click()}
        >
          {copy.import}
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,.geojson"
        className="hidden"
        aria-label={copy.import}
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
            .then((text) => {
              save.mutate(importedGeometry(JSON.parse(text) as unknown));
            })
            .catch((reason: unknown) => {
              console.error("[map] GeoJSON import failed", reason);
              setError(copy.invalidImport);
            });
        }}
      />
      {mode !== null && (
        <p role="status" className="text-xs">
          {mode === "rectangle" ? copy.drawRectangle : copy.drawPolygon}
          <Button size="sm" variant="ghost" onClick={() => onMode(null)}>
            {copy.cancel}
          </Button>
        </p>
      )}
      {draft !== null && (
        <p className="text-xs text-muted-foreground">{copy.dirty}</p>
      )}
      <Button
        size="sm"
        disabled={draft === null || save.isPending || disabled}
        onClick={() => {
          if (draft !== null) save.mutate(draft);
        }}
      >
        {save.isPending ? copy.saving : copy.save}
      </Button>
      {area !== null && (
        <Button
          size="sm"
          variant="ghost"
          disabled={!map.ready}
          onClick={() => {
            const points =
              area.geometry.type === "Polygon"
                ? area.geometry.coordinates.flat()
                : area.geometry.coordinates.flat(2);
            map.focusBounds([
              [
                Math.min(...points.map((point) => point[0]!)),
                Math.min(...points.map((point) => point[1]!)),
              ],
              [
                Math.max(...points.map((point) => point[0]!)),
                Math.max(...points.map((point) => point[1]!)),
              ],
            ]);
          }}
        >
          {copy.focusArea}
        </Button>
      )}
    </div>
  );
}
