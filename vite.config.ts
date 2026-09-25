/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base "./" lets the built site work from any path, including GitHub Pages
// project sites (https://<user>.github.io/<repo>/).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  test: { environment: "node" },
});
