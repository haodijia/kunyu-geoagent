declare module "virtual:kunyu-pdf-assets" {
  const assets: Readonly<Record<"cMapUrl" | "standardFontDataUrl" | "wasmUrl", Readonly<Record<string, string>>>>;
  export default assets;
}
