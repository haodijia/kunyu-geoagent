import type { TurnMapContext } from "@/features/agent/api";

export interface MapViewport {
  readonly latitude: number;
  readonly longitude: number;
  readonly zoom: number;
}

export interface SelectedMapFeature {
  readonly featureId: string;
  readonly layerId: string;
}

export interface MapContext {
  readonly activeObservationId: string | null;
  readonly activeResultLayerId: string | null;
  readonly comparisonObservationIds: readonly string[];
  readonly eventId: string | null;
  readonly selectedAoiId: string | null;
  readonly selectedFeature: SelectedMapFeature | null;
  readonly viewport: MapViewport;
  readonly visibleLayerIds: readonly string[];
  readonly workspaceId: string;
}

export function createMapContext(workspaceId: string): MapContext {
  return {
    activeObservationId: null,
    activeResultLayerId: null,
    comparisonObservationIds: [],
    eventId: null,
    selectedAoiId: null,
    selectedFeature: null,
    viewport: {
      latitude: 0,
      longitude: 0,
      zoom: 2
    },
    visibleLayerIds: [],
    workspaceId
  };
}

export function mapContextFromSnapshot(snapshot: TurnMapContext): MapContext {
  return {
    activeObservationId: snapshot.active_observation_id,
    activeResultLayerId: snapshot.active_result_layer_id,
    comparisonObservationIds: snapshot.comparison_observation_ids,
    eventId: snapshot.event_id,
    selectedAoiId: snapshot.selected_aoi_id,
    selectedFeature: snapshot.selected_feature === null ? null : {
      featureId: snapshot.selected_feature.feature_id,
      layerId: snapshot.selected_feature.layer_id,
    },
    viewport: snapshot.viewport,
    visibleLayerIds: snapshot.visible_layer_ids,
    workspaceId: snapshot.workspace_id,
  };
}
