import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const outputNames = {
  entryFileNames: "assets/[name].js",
  chunkFileNames: "assets/[name].js",
  assetFileNames: "assets/[name][extname]",
};
export default defineConfig({
  base: "./",
  plugins: [vue(), vueJsx(), tailwindcss()],
  css: { modules: { generateScopedName: "[name]__[local]" } },
  build: { rollupOptions: { output: outputNames } },
  worker: { format: "es", rollupOptions: { output: outputNames } },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: ["vue"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/openge": "http://127.0.0.1:3000",
    },
  },
});
