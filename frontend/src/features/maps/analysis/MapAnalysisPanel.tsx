import { useQuery } from "@tanstack/react-query";
import type { MapLayerMouseEvent } from "maplibre-gl";
import { X } from "lucide-react";
import { useCallback, useEffect, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  analysisApi,
  analysisKeys,
  type MapLayer,
} from "@/features/analysis/api";
import {
  assessmentApi,
  assessmentKeys,
  type Assessment,
  type StudyGeometry,
} from "@/features/assessments/api";
import { AssessmentRecords } from "@/features/maps/analysis/AssessmentRecords";
import {
  MapComparison,
  type ComparisonCapture,
} from "@/features/maps/analysis/MapComparison";
import { RasterInspector } from "@/features/maps/analysis/RasterInspector";
import { StudyAreaEditor } from "@/features/maps/analysis/StudyAreaEditor";
import {
  useStudyDrawing,
  useStudyOverlay,
} from "@/features/maps/analysis/useStudyDrawing";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { assessmentCopy as copy } from "@/locales/zh-CN/assessments";

export function MapAnalysisPanel({
  map,
  workspaceId,
  layers,
  open,
  onClose,
  capture,
}: {
  readonly map: ReturnType<typeof useSessionMap>;
  readonly workspaceId: string;
  readonly layers: readonly MapLayer[];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly capture: RefObject<ComparisonCapture | null>;
}) {
  const instance = map.getMap();
  const [tab, setTab] = useState<"area" | "inspect" | "reports">("area");
  const area = useQuery({
    queryKey: assessmentKeys.area(workspaceId),
    queryFn: () => assessmentApi.area(workspaceId),
  });
  const outputs = useQuery({
    queryKey: analysisKeys.outputs(workspaceId),
    queryFn: () => analysisApi.outputs(workspaceId),
  });
  const [draft, setDraft] = useState<StudyGeometry | null>(null);
  const complete = useCallback(
    (geometry: StudyGeometry) => setDraft(geometry),
    [],
  );
  const drawing = useStudyDrawing(instance, map.ready, complete);
  useStudyOverlay(instance, map.ready, draft ?? area.data?.geometry ?? null);
  useEffect(() => {
    if (!open || tab !== "area") drawing.setMode(null);
  }, [open, tab, drawing.setMode]);
  const [selectedRegion, setSelectedRegion] = useState<StudyGeometry | null>(
    null,
  );
  const [selectedOutput, setSelectedOutput] = useState<string | null>(null);
  const [pair, setPair] = useState<readonly [string, string] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const comparisonError = useCallback(
    (message: string) => setError(message),
    [],
  );
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const candidates = useQuery({
    queryKey: ["assessment-candidates", workspaceId, candidateId],
    enabled: candidateId !== null,
    queryFn: () => assessmentApi.features(workspaceId, candidateId!),
  });
  useEffect(() => {
    if (
      instance === null ||
      !map.ready ||
      candidates.data === undefined ||
      candidateId === null
    )
      return;
    const id = "assessment-candidates";
    instance.addSource(id, { type: "geojson", data: candidates.data });
    instance.addLayer({
      id,
      source: id,
      type: "fill",
      paint: { "fill-color": "#ef4444", "fill-opacity": 0.2 },
    });
    instance.addLayer({
      id: id + "-line",
      source: id,
      type: "line",
      paint: { "line-color": "#dc2626", "line-width": 1.5 },
    });
    const click = (event: MapLayerMouseEvent) => {
      const geometry = event.features?.[0]?.geometry;
      if (geometry?.type === "Polygon" || geometry?.type === "MultiPolygon") {
        setSelectedRegion(geometry);
        setTab("inspect");
      }
    };
    instance.on("click", id, click);
    return () => {
      instance.off("click", id, click);
      if (instance.getStyle() === undefined) return;
      for (const layer of [id + "-line", id])
        if (instance.getLayer(layer) !== undefined) instance.removeLayer(layer);
      if (instance.getSource(id) !== undefined) instance.removeSource(id);
    };
  }, [instance, map.ready, candidates.data, candidateId]);
  function showCandidates(value: Assessment) {
    setSelectedRegion(null);
    setSelectedOutput(value.output_id);
    setCandidateId((current) => (current === value.id ? null : value.id));
  }
  const region = selectedRegion ?? draft ?? area.data?.geometry ?? null;
  return (
    <>
      {pair !== null && (
        <MapComparison
          map={map}
          layers={layers}
          pair={pair}
          capture={capture}
          onError={comparisonError}
        />
      )}
      <aside
        aria-label={copy.open}
        className={`${open ? "flex" : "hidden"} absolute top-4 right-16 z-20 max-h-[calc(100%-var(--map-overlay-height,180px)-2rem)] w-[360px] max-w-[calc(100%-5rem)] flex-col rounded-xl border border-border bg-background/95 shadow-sm backdrop-blur`}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex gap-1">
            {(["area", "inspect", "reports"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={tab === value ? "secondary" : "ghost"}
                onClick={() => setTab(value)}
                aria-pressed={tab === value}
              >
                {copy[value]}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={copy.close}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto p-3">
          {(error !== null ||
            area.isError ||
            outputs.isError ||
            candidates.isError) && (
            <p role="alert" className="break-words text-xs text-destructive">
              {error ??
                area.error?.message ??
                outputs.error?.message ??
                candidates.error?.message}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void Promise.all([area.refetch(), outputs.refetch()])
                }
              >
                {copy.refresh}
              </Button>
            </p>
          )}
          <div className={tab === "area" ? "block" : "hidden"}>
            <StudyAreaEditor
              map={map}
              workspaceId={workspaceId}
              area={area.data ?? null}
              draft={draft}
              disabled={area.isPending || area.isError}
              mode={drawing.mode}
              onMode={drawing.setMode}
              onSaved={() => setDraft(null)}
            />
          </div>
          <div className={tab === "inspect" ? "block" : "hidden"}>
            <RasterInspector
              map={map}
              workspaceId={workspaceId}
              outputs={outputs.data ?? []}
              layers={layers}
              active={open && tab === "inspect"}
              region={region}
              selectedRegion={selectedRegion !== null}
              draftRegion={selectedRegion === null && draft !== null}
              selectedOutput={selectedOutput}
              drawing={drawing.mode !== null}
              onStopDrawing={() => drawing.setMode(null)}
              onClearRegion={() => setSelectedRegion(null)}
              pair={pair}
              onPair={(value) => {
                setError(null);
                setPair(value);
              }}
            />
          </div>
          <div className={tab === "reports" ? "block" : "hidden"}>
            <AssessmentRecords
              workspaceId={workspaceId}
              area={area.data ?? null}
              outputs={outputs.data ?? []}
              active={open && tab === "reports"}
              candidateId={candidateId}
              onCandidates={showCandidates}
            />
          </div>
        </div>
      </aside>
    </>
  );
}
