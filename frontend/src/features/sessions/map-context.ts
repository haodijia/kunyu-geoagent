import type { RegionGeometry } from "@/features/analysis/raster";
import type { Point } from "geojson";
export interface MapObjectReference {
  readonly output_id: string;
  readonly dataset_id: string;
  readonly feature_index: number;
}
interface GeometrySelection {
  readonly geometry: Point | RegionGeometry;
  readonly layer_id: string | null;
  readonly object?: never;
}
interface ObjectSelection {
  readonly object: MapObjectReference;
  readonly name: string | null;
  readonly layer_id: string | null;
  readonly geometry?: never;
}
export type MapSelection = GeometrySelection | ObjectSelection;
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
  latitude: 30,
  longitude: 105,
  zoom: 3,
};
export const INITIAL_MAP_CAMERA: MapCamera = {
  dimension: "2d",
  bearing: 0,
  pitch: 0,
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
    workspaceId,
  };
}
