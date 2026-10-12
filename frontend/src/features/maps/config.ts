export const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/fiord"
} as const;

export const MAP_TERRAIN = {
  sourceId: "kunyu-terrain",
  hillshadeSourceId: "kunyu-hillshade",
  hillshadeLayerId: "kunyu-hillshade",
  url: "https://tiles.mapterhorn.com/tilejson.json",
  encoding: "terrarium",
  tileSize: 512,
  maxzoom: 12,
  attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>',
  exaggeration: 1,
  pitch: 55,
  maxPitch: 80
} as const;

export const MAP_HILLSHADE_COLORS = {
  light: { shadow: "#545969", highlight: "#ffffff", accent: "#929dac" },
  dark: { shadow: "#000000", highlight: "#657585", accent: "#384352" }
} as const;

export const MAP_DIMENSIONS = ["2d", "3d"] as const;
export const MAP_LOAD_TIMEOUT_MS = 20_000;
