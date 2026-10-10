import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

import pkg from "./package.json" with { type: "json" };

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Relative asset paths, so the bundle works wherever it's served from (hc-spin, Moss's applet:// origin).
  base: "./",
  // Tests that use runes (*.svelte.test.ts) opt into jsdom with `// @vitest-environment jsdom`, so they're
  // compiled for the browser and $state is genuinely proxied, as in the app.
  resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
});
