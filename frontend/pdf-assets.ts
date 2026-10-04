import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

export function pdfAssets(): Plugin {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve("pdfjs-dist/package.json"));
  const directories = { cMapUrl: "cmaps", standardFontDataUrl: "standard_fonts", wasmUrl: "wasm" };
  const moduleId = "\0kunyu-pdf-assets";
  const license = ["LICENSE", ...Object.values(directories).flatMap(directory => readdirSync(join(root, directory)).filter(name => name.startsWith("LICENSE")).map(name => `${directory}/${name}`))].map(name => `${name}\n\n${readFileSync(join(root, name), "utf8")}`).join("\n\n")
    + "\n\nDeepSeek\n\n" + readFileSync(join(import.meta.dirname, "../licenses/DeepSeek-LICENSE.txt"), "utf8");
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
    generateBundle() { this.emitFile({ type: "asset", fileName: "assets/pdf-LICENSE.txt", source: license }); },
  };
}
