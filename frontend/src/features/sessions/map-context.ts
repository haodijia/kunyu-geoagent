import type { Point } from "geojson";
import type { RegionGeometry } from "@/features/analysis/raster";

export interface MapSelection {
  readonly geometry: Point | RegionGeometry;
  readonly layer_id: string | null;
}

export interface MapViewport {
  readonly latitude: number;
  readonly longitude: number;
  readonly zoom: number;
}

export type MapBounds = readonly [number, number, number, number];

export type MapDimension = "2d" | "3d";

export interface MapCamera {
  readonly dimension: MapDimension;
  readonly bearing: number;
  readonly pitch: number;
}

export interface MapView {
  readonly viewport: MapViewport;
  readonly camera: MapCamera;
  readonly expanded_layer_id: string | null;
}

export const INITIAL_MAP_VIEWPORT: MapViewport = {
  latitude: 25.932,
  longitude: 108.521,
  zoom: 11
};

export const INITIAL_MAP_CAMERA: MapCamera = {
  dimension: "2d",
  bearing: 0,
  pitch: 0
};

export interface MapContext {
  readonly selection: MapSelection | null;
  readonly camera: MapCamera;
  readonly viewport: MapViewport;
  readonly workspaceId: string;
}

export function createMapContext(workspaceId: string): MapContext {
  return {
    selection: null,
    camera: INITIAL_MAP_CAMERA,
    viewport: INITIAL_MAP_VIEWPORT,
    workspaceId
  };
}
