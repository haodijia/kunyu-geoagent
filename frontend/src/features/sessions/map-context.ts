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
