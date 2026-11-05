// The custom element: dist/book-wall.js (ES module) and dist/book-wall.iife.js
// (a classic script, for a page without a bundler). CSS is inlined into the
// element's shadow root, so there is no stylesheet to ship.
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/wall/index.ts",
      name: "BookWall",
      formats: ["es", "iife"],
      fileName: (f) => (f === "es" ? "book-wall.js" : "book-wall.iife.js"),
    },
    target: "es2022",
  },
});
