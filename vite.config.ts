// The demo site (demo/). `npm run dev` serves it with the element from source.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: "demo",
  resolve: { alias: { "book-wall": fileURLToPath(new URL("./src/wall/index.ts", import.meta.url)) } },
  build: { outDir: "../dist-demo", emptyOutDir: true },
});
