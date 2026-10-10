import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // Relative asset paths, so the bundle works wherever it's served from (hc-spin, Moss's applet:// origin).
  base: "./",
});
