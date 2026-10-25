import type { AnalysisOutput } from "./api";

export interface RasterCategory {
  readonly value: number;
  readonly label: string;
  readonly color: string;
}
export interface RasterBand {
  readonly index: number;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly unit: string | null;
  readonly dtype: string;
  readonly nodata: number | null;
  readonly summary: BandSummary;
}
export interface BandSummary {
  readonly valid_pixels: number;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly mean: number | null;
  readonly grid_pixel_area_m2?: number;
  readonly value_counts: readonly {
    readonly value: number;
    readonly pixel_count: number;
  }[];
}
export type RasterStyle =
  | {
      readonly type: "classified";
      readonly classes: readonly RasterCategory[];
      readonly transparent_values: readonly number[];
    }
  | {
      readonly type: "continuous";
      readonly color_ramp: "viridis" | "blue" | "gray";
      readonly stretch: unknown;
    }
  | { readonly type: "rgb"; readonly stretch: unknown };
export interface RasterView {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly group: string;
  readonly bands: readonly number[];
  readonly style: RasterStyle;
  readonly render_ranges: readonly (readonly [number, number])[];
}
export interface RasterMetadata {
  readonly width: number;
  readonly height: number;
  readonly band_count: number;
  readonly crs: string;
  readonly bands: readonly RasterBand[];
  readonly views: readonly RasterView[];
  readonly default_view: string;
}
export function rasterView(
  output: AnalysisOutput,
  viewId = output.metadata.default_view,
): RasterView {
  const view = output.metadata.views.find((item) => item.id === viewId);
  if (view === undefined)
    throw new Error(`Raster view is unavailable: ${viewId}`);
  return view;
}
export const colorRamps = {
  viridis: "linear-gradient(to right,#440154,#3b528b,#21918c,#5ec962,#fde725)",
  blue: "linear-gradient(to right,#f7fbff,#6baed6,#08306b)",
  gray: "linear-gradient(to right,#000,#fff)",
} as const;
