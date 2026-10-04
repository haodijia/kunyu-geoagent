import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

export function pdfAssets(): Plugin {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve("pdfjs-dist/package.json"));
  const directories = { cMapUrl: "cmaps", standardFontDataUrl: "standard_fonts", wasmUrl: "wasm" };
  const moduleId = "\0kunyu-pdf-assets";
  return {
    name: "kunyu-pdf-assets",
    resolveId(source) { return source === "virtual:kunyu-pdf-assets" ? moduleId : null; },
    load(id) {
      if (id !== moduleId) return null;
      const assets = Object.fromEntries(Object.entries(directories).map(([kind, directory]) => [kind, Object.fromEntries(readdirSync(join(root, directory)).filter(name => !name.startsWith("LICENSE")).sort().map(name => {
        const path = join(root, directory, name); this.addWatchFile(path); return [name, readFileSync(path).toString("base64")];
      }))]));
      return `export default ${JSON.stringify(assets)};`;
    },
  };
}
